import type { ExtensionBackgroundApi, ExtensionStorageArea } from './api';
import {
  isSponsorStorageRequest,
  SPONSOR_STORAGE_CHANGED,
  type SponsorRuntimeId,
  type SponsorStorageAreaName,
  type SponsorStorageOperation,
  sponsorStorageNamespaceKey,
} from './sponsor-runtime';

type StorageValues = Record<string, unknown>;
type StorageChanges = Record<string, chrome.storage.StorageChange>;

type SponsorStorageHost = (
  runtimeId: SponsorRuntimeId,
  areaName: SponsorStorageAreaName,
  operation: SponsorStorageOperation,
  payload?: unknown,
) => Promise<unknown>;

function record(value: unknown): value is StorageValues {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function keys(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === 'string')
  ) {
    return value;
  }
  return [];
}

function selectedValues(values: StorageValues, selector: unknown) {
  if (selector === null || selector === undefined)
    return structuredClone(values);
  if (record(selector)) {
    return Object.fromEntries(
      Object.entries(selector).map(([key, fallback]) => [
        key,
        key in values ? structuredClone(values[key]) : fallback,
      ]),
    );
  }
  return Object.fromEntries(
    keys(selector).flatMap((key) =>
      key in values ? [[key, structuredClone(values[key])]] : [],
    ),
  );
}

function changedValues(previous: StorageValues, next: StorageValues) {
  const changes: StorageChanges = {};
  for (const key of new Set([...Object.keys(previous), ...Object.keys(next)])) {
    const oldValue = previous[key];
    const newValue = next[key];
    if (Object.is(oldValue, newValue)) continue;
    if (JSON.stringify(oldValue) === JSON.stringify(newValue)) continue;
    changes[key] = {
      ...(key in previous ? { oldValue: structuredClone(oldValue) } : {}),
      ...(key in next ? { newValue: structuredClone(newValue) } : {}),
    };
  }
  return changes;
}

export class SponsorRuntimeStorageService {
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly api: ExtensionBackgroundApi) {}

  private area(areaName: SponsorStorageAreaName): ExtensionStorageArea {
    return this.api.storage[areaName];
  }

  private async readNamespace(
    runtimeId: SponsorRuntimeId,
    areaName: SponsorStorageAreaName,
  ) {
    const key = sponsorStorageNamespaceKey(runtimeId, areaName);
    const stored = (await this.area(areaName).get(key))[key];
    return record(stored) ? stored : {};
  }

  private async mutate(
    runtimeId: SponsorRuntimeId,
    areaName: SponsorStorageAreaName,
    mutation: (current: StorageValues) => StorageValues,
  ) {
    const current = await this.readNamespace(runtimeId, areaName);
    const next = mutation(structuredClone(current));
    const changes = changedValues(current, next);
    if (Object.keys(changes).length === 0) return;
    await this.area(areaName).set({
      [sponsorStorageNamespaceKey(runtimeId, areaName)]: next,
    });
    await this.api.runtime
      .sendMessage({
        type: SPONSOR_STORAGE_CHANGED,
        runtimeId,
        areaName,
        changes,
      })
      .catch(() => undefined);
  }

  request(
    runtimeId: SponsorRuntimeId,
    areaName: SponsorStorageAreaName,
    operation: SponsorStorageOperation,
    payload?: unknown,
  ) {
    const queueKey = `${runtimeId}:${areaName}`;
    const previous = this.queues.get(queueKey) ?? Promise.resolve();
    const task = previous.then(async () => {
      if (operation === 'get') {
        return selectedValues(
          await this.readNamespace(runtimeId, areaName),
          payload,
        );
      }
      if (operation === 'set') {
        await this.mutate(runtimeId, areaName, (current) => ({
          ...current,
          ...(payload as StorageValues),
        }));
        return undefined;
      }
      if (operation === 'remove') {
        await this.mutate(runtimeId, areaName, (current) => {
          for (const key of keys(payload)) delete current[key];
          return current;
        });
        return undefined;
      }
      await this.mutate(runtimeId, areaName, () => ({}));
      return undefined;
    });
    this.queues.set(
      queueKey,
      task.then(
        () => undefined,
        () => undefined,
      ),
    );
    return task;
  }

  set(
    runtimeId: SponsorRuntimeId,
    areaName: SponsorStorageAreaName,
    values: StorageValues,
  ) {
    return this.request(runtimeId, areaName, 'set', values);
  }

  reset(runtimeId?: SponsorRuntimeId) {
    const runtimeIds: readonly SponsorRuntimeId[] = runtimeId
      ? [runtimeId]
      : ['bilibili', 'youtube'];
    return Promise.all(
      runtimeIds.flatMap((id) =>
        (['sync', 'local'] as const).map((areaName) =>
          this.request(id, areaName, 'clear'),
        ),
      ),
    ).then(() => undefined);
  }

  handlesMessage(
    message: unknown,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ) {
    if (!isSponsorStorageRequest(message)) return false;
    if (sender.id !== this.api.runtime.id) {
      sendResponse({ error: 'Sponsor runtime storage access was rejected.' });
      return true;
    }
    void this.request(
      message.runtimeId,
      message.areaName,
      message.operation,
      message.payload,
    ).then(
      (result) => sendResponse({ result }),
      (error) =>
        sendResponse({
          error: error instanceof Error ? error.message : String(error),
        }),
    );
    return true;
  }
}

export function installSponsorRuntimeStorageHost(
  service: SponsorRuntimeStorageService,
) {
  (
    globalThis as typeof globalThis & {
      __cardMasterSponsorStorageHost?: SponsorStorageHost;
    }
  ).__cardMasterSponsorStorageHost = (
    runtimeId,
    areaName,
    operation,
    payload,
  ) => service.request(runtimeId, areaName, operation, payload);
}
