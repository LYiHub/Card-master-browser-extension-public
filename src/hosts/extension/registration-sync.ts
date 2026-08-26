import { UserscriptResourceLoader } from '../../userscript/application/resource-loader';
import type { ScriptRepository } from '../../userscript/application/script-repository';
import { matchInstalledUserscript } from '../../userscript/domain/matcher';
import type { InstalledUserscript } from '../../userscript/domain/types';
import type {
  ExtensionBackgroundApi,
  ExtensionUserscriptApi,
  RegisteredUserScript,
} from './api';
import { extensionDiagnostics } from './diagnostics';
import {
  type RegistrationIdentity,
  registeredUnsafeWindowBridge,
  registeredUserscript,
  unsafeWindowBridgeRegistrationId,
} from './registered-userscripts';

const REGISTRATION_IDENTITIES_STORAGE_KEY =
  'card-master.registration-identities.v1';
const REGISTRATION_PREFIX = 'card-';

function randomIdentifier(bytes = 18) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(values, (value) =>
    value.toString(36).padStart(2, '0'),
  ).join('');
}

function registrationIdentity(): RegistrationIdentity {
  const identity = randomIdentifier();
  return {
    capability: randomIdentifier(24),
    registrationId: `${REGISTRATION_PREFIX}${identity}`,
    worldId: `${REGISTRATION_PREFIX}world-${identity}`,
  };
}

function identityRecord(value: unknown): value is RegistrationIdentity {
  return (
    Boolean(value && typeof value === 'object') &&
    typeof (value as RegistrationIdentity).capability === 'string' &&
    (value as RegistrationIdentity).capability.length >= 32 &&
    typeof (value as RegistrationIdentity).registrationId === 'string' &&
    (value as RegistrationIdentity).registrationId.startsWith(
      REGISTRATION_PREFIX,
    ) &&
    typeof (value as RegistrationIdentity).worldId === 'string' &&
    (value as RegistrationIdentity).worldId.startsWith(
      `${REGISTRATION_PREFIX}world-`,
    )
  );
}

function identityMap(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return new Map<string, RegistrationIdentity>();
  }
  return new Map(
    Object.entries(value).flatMap(([scriptId, identity]) =>
      identityRecord(identity) ? [[scriptId, identity] as const] : [],
    ),
  );
}

export class RegisteredUserscriptSynchronizer {
  private readonly scripts = new Map<string, InstalledUserscript>();
  private readonly identities = new Map<string, RegistrationIdentity>();
  private readonly errors = new Map<string, string>();
  private syncPromise: Promise<void> | null = null;
  private dirty = false;
  private initialized = false;
  private runtimeReady = false;
  private runtimeReadyPromise: Promise<void> | null = null;
  private resolveRuntimeReady: (() => void) | null = null;
  private rejectRuntimeReady: ((reason: unknown) => void) | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly api: ExtensionBackgroundApi,
    private readonly repository: ScriptRepository,
    private readonly resourceLoader = new UserscriptResourceLoader(),
    private readonly nativeApi: ExtensionUserscriptApi | null = 'userScripts' in
    api
      ? (api as ExtensionUserscriptApi)
      : null,
  ) {}

  schedule() {
    this.dirty = true;
    if (this.syncPromise) return this.syncPromise;
    this.syncPromise = this.drain().finally(() => {
      this.syncPromise = null;
    });
    return this.syncPromise;
  }

  ensureReady() {
    return this.initialized
      ? (this.syncPromise ?? Promise.resolve())
      : this.schedule();
  }

  ensureRuntimeReady() {
    if (this.runtimeReady) return Promise.resolve();
    if (!this.runtimeReadyPromise) {
      this.runtimeReadyPromise = new Promise<void>((resolve, reject) => {
        this.resolveRuntimeReady = resolve;
        this.rejectRuntimeReady = reject;
      });
    }
    void this.schedule();
    return this.runtimeReadyPromise;
  }

  getScript(scriptId: string) {
    return this.scripts.get(scriptId);
  }

  getError(scriptId: string) {
    return this.lastError ?? this.errors.get(scriptId) ?? null;
  }

  async executionRegistrations(scriptId: string) {
    await this.ensureReady();
    const error = this.getError(scriptId);
    if (error) throw new Error(error);
    const script = this.scripts.get(scriptId);
    const identity = this.identities.get(scriptId);
    if (!script || !identity) {
      throw new Error('已提交的脚本未进入注册系统。');
    }
    const bundle = await this.resourceLoader.load(script);
    return {
      script,
      registrations: [
        registeredUnsafeWindowBridge(script, identity),
        registeredUserscript(script, bundle, identity),
      ].filter(
        (registration): registration is RegisteredUserScript =>
          registration !== null,
      ),
    };
  }

  async pageExecutionRegistrations(
    context: {
      url: string;
      frameId: number;
      topFrame: boolean;
    },
    runAt: RegisteredUserScript['runAt'],
  ) {
    await this.ensureReady();
    if (this.lastError) throw new Error(this.lastError);
    const registrations: RegisteredUserScript[] = [];
    for (const script of this.scripts.values()) {
      if (
        !script.manager.enabled ||
        !matchInstalledUserscript(script, {
          ...context,
          softNavigation: false,
        }).eligible
      ) {
        continue;
      }
      const identity = this.identities.get(script.id);
      if (!identity) continue;
      try {
        const bundle = await this.resourceLoader.load(script);
        registrations.push(
          ...[
            registeredUnsafeWindowBridge(script, identity),
            registeredUserscript(script, bundle, identity),
          ].filter(
            (registration): registration is RegisteredUserScript =>
              registration?.runAt === runAt,
          ),
        );
      } catch (error) {
        this.errors.set(
          script.id,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
    return registrations;
  }

  accepts(scriptId: string, capability: string) {
    return this.identities.get(scriptId)?.capability === capability;
  }

  private async drain() {
    while (this.dirty) {
      this.dirty = false;
      try {
        await this.syncOnce();
        this.lastError = null;
        this.initialized = true;
      } catch (error) {
        this.lastError = error instanceof Error ? error.message : String(error);
        if (!this.runtimeReady) this.failRuntimeReady(error);
        extensionDiagnostics.error(
          'userscript-registration',
          'synchronization-failed',
          error,
        );
      }
    }
  }

  private async syncOnce() {
    const storedIdentities = identityMap(
      (await this.api.storage.local.get(REGISTRATION_IDENTITIES_STORAGE_KEY))[
        REGISTRATION_IDENTITIES_STORAGE_KEY
      ],
    );
    this.identities.clear();
    for (const [scriptId, identity] of storedIdentities) {
      this.identities.set(scriptId, identity);
    }

    const scripts = await this.repository.list();
    this.scripts.clear();
    for (const script of scripts) this.scripts.set(script.id, script);
    const activeIds = new Set(scripts.map((script) => script.id));
    const removedIdentities: RegistrationIdentity[] = [];
    for (const scriptId of this.identities.keys()) {
      if (!activeIds.has(scriptId)) {
        const identity = this.identities.get(scriptId);
        if (identity) removedIdentities.push(identity);
        this.identities.delete(scriptId);
      }
    }
    for (const script of scripts) {
      if (!this.identities.has(script.id)) {
        this.identities.set(script.id, registrationIdentity());
      }
    }
    await this.persistIdentities();
    this.markRuntimeReady();

    const nativeApi = this.nativeApi;
    if (!nativeApi) {
      this.errors.clear();
      await Promise.all(
        scripts.map(async (script) => {
          if (!script.manager.enabled) return;
          const identity = this.identities.get(script.id);
          if (!identity) return;
          try {
            const bundle = await this.resourceLoader.load(script);
            registeredUnsafeWindowBridge(script, identity);
            registeredUserscript(script, bundle, identity);
          } catch (error) {
            this.errors.set(
              script.id,
              error instanceof Error ? error.message : String(error),
            );
          }
        }),
      );
      return;
    }

    const existing = new Set(
      (await nativeApi.userScripts.getScripts()).map((script) => script.id),
    );
    const desired = new Set<string>();
    this.errors.clear();
    for (const identity of removedIdentities) {
      await this.unregister(existing, identity);
    }

    await Promise.all(
      scripts.map(async (script) => {
        const identity = this.identities.get(script.id);
        if (!identity) return;
        if (!script.manager.enabled) {
          await this.unregister(existing, identity);
          return;
        }

        try {
          const bundle = await this.resourceLoader.load(script);
          const registrations = [
            registeredUnsafeWindowBridge(script, identity),
            registeredUserscript(script, bundle, identity),
          ].filter(
            (registration): registration is RegisteredUserScript =>
              registration !== null,
          );
          if (registrations.length === 0) return;
          for (const registration of registrations)
            desired.add(registration.id);
          if (
            registrations.some(
              (registration) => registration.world === 'USER_SCRIPT',
            )
          ) {
            await nativeApi.userScripts.configureWorld({
              worldId: identity.worldId,
              messaging: true,
              csp: "script-src 'self' 'unsafe-eval'; object-src 'self'",
            });
          } else {
            await nativeApi.userScripts
              .resetWorldConfiguration(identity.worldId)
              .catch(() => undefined);
          }
          for (const registration of registrations) {
            await this.applyRegistration(existing, registration);
          }
        } catch (error) {
          desired.delete(identity.registrationId);
          desired.delete(unsafeWindowBridgeRegistrationId(identity));
          this.errors.set(
            script.id,
            error instanceof Error ? error.message : String(error),
          );
          await this.unregister(existing, identity);
        }
      }),
    );

    for (const registrationId of existing) {
      if (!desired.has(registrationId)) {
        await nativeApi.userScripts.unregister({ ids: [registrationId] });
      }
    }
  }

  private async applyRegistration(
    existing: Set<string>,
    registration: RegisteredUserScript,
  ) {
    if (!this.nativeApi) return;
    if (!existing.has(registration.id)) {
      await this.nativeApi.userScripts.register([registration]);
      existing.add(registration.id);
      return;
    }
    try {
      await this.nativeApi.userScripts.update([registration]);
    } catch {
      await this.nativeApi.userScripts.unregister({ ids: [registration.id] });
      existing.delete(registration.id);
      await this.nativeApi.userScripts.register([registration]);
      existing.add(registration.id);
    }
  }

  private async unregister(
    existing: Set<string>,
    identity: RegistrationIdentity,
  ) {
    const registrationIds = [
      identity.registrationId,
      unsafeWindowBridgeRegistrationId(identity),
    ].filter((registrationId) => existing.has(registrationId));
    if (!this.nativeApi) return;
    if (registrationIds.length > 0) {
      await this.nativeApi.userScripts.unregister({
        ids: registrationIds,
      });
      for (const registrationId of registrationIds) {
        existing.delete(registrationId);
      }
    }
    await this.nativeApi.userScripts
      .resetWorldConfiguration(identity.worldId)
      .catch(() => undefined);
  }

  private async persistIdentities() {
    await this.api.storage.local.set({
      [REGISTRATION_IDENTITIES_STORAGE_KEY]: Object.fromEntries(
        this.identities,
      ),
    });
  }

  private markRuntimeReady() {
    this.runtimeReady = true;
    this.resolveRuntimeReady?.();
    this.runtimeReadyPromise = null;
    this.resolveRuntimeReady = null;
    this.rejectRuntimeReady = null;
  }

  private failRuntimeReady(error: unknown) {
    this.rejectRuntimeReady?.(error);
    this.runtimeReadyPromise = null;
    this.resolveRuntimeReady = null;
    this.rejectRuntimeReady = null;
  }
}
