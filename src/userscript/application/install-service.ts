import {
  formatMetadataDiagnostic,
  parseUserscriptMetadata,
  userscriptIdentity,
} from '../domain/metadata';
import type {
  InstalledUserscript,
  MetadataDiagnostic,
  UserscriptManagerConfig,
  UserscriptMetadata,
  UserscriptPresentation,
} from '../domain/types';
import { userscriptInstallationDiagnostics } from './preflight';
import {
  allocateUserscriptPresentation,
  resolveUserscriptPresentation,
} from './presentation';

type InstallUserscriptSourceOptions = {
  source: string;
  origin?: string;
  manager?: UserscriptManagerConfig;
  presentation?: UserscriptPresentation;
  createId: () => string;
  now: () => number;
  random?: () => number;
};

type ParsedInstallOptions = InstallUserscriptSourceOptions & {
  current: readonly InstalledUserscript[];
  existing: InstalledUserscript | null;
  metadata: UserscriptMetadata;
  parseDiagnostics: readonly MetadataDiagnostic[];
};

export type UserscriptInstallation = {
  mode: 'installed' | 'replaced';
  script: InstalledUserscript;
  scripts: InstalledUserscript[];
  diagnostics: readonly MetadataDiagnostic[];
};

export class UserscriptInstallError extends Error {
  constructor(readonly diagnostics: readonly MetadataDiagnostic[]) {
    super(
      diagnostics
        .filter((diagnostic) => diagnostic.severity === 'error')
        .map(formatMetadataDiagnostic)
        .join(' '),
    );
    this.name = 'UserscriptInstallError';
  }
}

export function userscriptIdentityConflict(
  current: readonly InstalledUserscript[],
  metadata: UserscriptMetadata,
  exceptId?: string,
) {
  const identity = userscriptIdentity(metadata);
  return (
    current.find(
      (script) =>
        script.id !== exceptId &&
        userscriptIdentity(script.metadata) === identity,
    ) ?? null
  );
}

function initialRuntime(enabled: boolean) {
  return {
    tabId: 1,
    frameId: 0,
    instanceId: null,
    status: enabled ? ('idle' as const) : ('sleeping' as const),
    commands: [],
    pendingRefresh: false,
  };
}

function prepareUserscript({
  source,
  origin,
  manager,
  presentation,
  createId,
  now,
  random,
  current,
  existing,
  metadata,
  parseDiagnostics,
}: ParsedInstallOptions) {
  const timestamp = now();
  const resolvedManager = existing?.manager ??
    manager ?? {
      enabled: true,
      checkForUpdates: true,
      userMatches: [],
      userIncludes: [],
      userExcludeMatches: [],
      userExcludes: [],
    };
  const enabled = resolvedManager.enabled;
  const script: InstalledUserscript = {
    id: existing?.id ?? createId(),
    kind: 'userscript',
    source: {
      code: source,
      origin: origin ?? existing?.source.origin,
      installedAt: existing?.source.installedAt ?? timestamp,
      updatedAt: timestamp,
    },
    presentation: resolveUserscriptPresentation(
      existing?.presentation ??
        presentation ??
        allocateUserscriptPresentation(
          current.flatMap((script) =>
            script.presentation ? [script.presentation] : [],
          ),
          random,
        ),
    ),
    metadata,
    manager: structuredClone(resolvedManager),
    runtime: initialRuntime(enabled),
  };
  const diagnostics = [
    ...parseDiagnostics,
    ...userscriptInstallationDiagnostics(script),
  ];
  if (diagnostics.some((diagnostic) => diagnostic.severity === 'error')) {
    throw new UserscriptInstallError(diagnostics);
  }
  return { script, diagnostics };
}

function applyUserscriptSource(
  current: readonly InstalledUserscript[],
  options: InstallUserscriptSourceOptions,
  replaceExisting: boolean,
): UserscriptInstallation {
  const parsed = parseUserscriptMetadata(options.source);
  if (!parsed.metadata) {
    throw new UserscriptInstallError(parsed.diagnostics);
  }

  const existing = userscriptIdentityConflict(current, parsed.metadata);
  if (existing && !replaceExisting) {
    throw new UserscriptInstallError([
      {
        severity: 'error',
        code: 'identity-conflict',
        message: `已经存在同名同命名空间的脚本“${existing.metadata.name}”，请读取该脚本后执行更新。`,
      },
    ]);
  }
  const existingIndex = existing
    ? current.findIndex((script) => script.id === existing.id)
    : -1;
  const { script, diagnostics } = prepareUserscript({
    ...options,
    current,
    existing,
    metadata: parsed.metadata,
    parseDiagnostics: parsed.diagnostics,
  });

  if (existingIndex < 0) {
    return {
      mode: 'installed',
      script,
      scripts: [...current, script],
      diagnostics,
    };
  }

  return {
    mode: 'replaced',
    script,
    scripts: current.map((item, index) =>
      index === existingIndex ? script : item,
    ),
    diagnostics,
  };
}

export function installUserscriptSource(
  current: readonly InstalledUserscript[],
  options: InstallUserscriptSourceOptions,
) {
  return applyUserscriptSource(current, options, true);
}

export function createUserscriptSource(
  current: readonly InstalledUserscript[],
  options: InstallUserscriptSourceOptions,
) {
  return applyUserscriptSource(current, options, false);
}

export function replaceUserscriptSource(
  current: readonly InstalledUserscript[],
  targetScriptId: string,
  options: InstallUserscriptSourceOptions,
): UserscriptInstallation {
  const existingIndex = current.findIndex(
    (script) => script.id === targetScriptId,
  );
  const existing = existingIndex >= 0 ? current[existingIndex] : null;
  if (!existing) {
    throw new Error(`找不到要更新的用户脚本：${targetScriptId}`);
  }
  const parsed = parseUserscriptMetadata(options.source);
  if (!parsed.metadata) {
    throw new UserscriptInstallError(parsed.diagnostics);
  }
  const conflict = userscriptIdentityConflict(
    current,
    parsed.metadata,
    targetScriptId,
  );
  if (conflict) {
    throw new UserscriptInstallError([
      {
        severity: 'error',
        code: 'identity-conflict',
        message: `脚本身份已经属于“${conflict.metadata.name}”。`,
      },
    ]);
  }
  const { script, diagnostics } = prepareUserscript({
    ...options,
    current,
    existing,
    metadata: parsed.metadata,
    parseDiagnostics: parsed.diagnostics,
  });
  return {
    mode: 'replaced',
    script,
    scripts: current.map((item, index) =>
      index === existingIndex ? script : item,
    ),
    diagnostics,
  };
}
