export const SPONSOR_RUNTIME_IDS = ['bilibili', 'youtube'] as const;

export type SponsorRuntimeId = (typeof SPONSOR_RUNTIME_IDS)[number];
export type SponsorStorageAreaName = 'local' | 'sync';
export type SponsorStorageOperation = 'get' | 'set' | 'remove' | 'clear';

export const SPONSOR_STORAGE_REQUEST = 'card-master:sponsor-storage';
export const SPONSOR_STORAGE_CHANGED = 'card-master:sponsor-storage-changed';
export const SPONSOR_RUNTIME_MESSAGE = 'card-master:sponsor-runtime-message';
export const SPONSOR_RUNTIME_PORT_PREFIX = 'card-master:sponsor-runtime-port';

export type SponsorStorageRequest = {
  type: typeof SPONSOR_STORAGE_REQUEST;
  runtimeId: SponsorRuntimeId;
  areaName: SponsorStorageAreaName;
  operation: SponsorStorageOperation;
  payload?: unknown;
};

export type SponsorStorageChangedMessage = {
  type: typeof SPONSOR_STORAGE_CHANGED;
  runtimeId: SponsorRuntimeId;
  areaName: SponsorStorageAreaName;
  changes: Record<string, chrome.storage.StorageChange>;
};

export type SponsorRuntimeMessage = {
  type: typeof SPONSOR_RUNTIME_MESSAGE;
  runtimeId: SponsorRuntimeId;
  payload: unknown;
};

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function isSponsorRuntimeId(value: unknown): value is SponsorRuntimeId {
  return SPONSOR_RUNTIME_IDS.some((runtimeId) => runtimeId === value);
}

export function isSponsorStorageAreaName(
  value: unknown,
): value is SponsorStorageAreaName {
  return value === 'local' || value === 'sync';
}

export function isSponsorStorageRequest(
  value: unknown,
): value is SponsorStorageRequest {
  if (
    !record(value) ||
    value.type !== SPONSOR_STORAGE_REQUEST ||
    !isSponsorRuntimeId(value.runtimeId) ||
    !isSponsorStorageAreaName(value.areaName)
  ) {
    return false;
  }
  if (
    value.operation !== 'get' &&
    value.operation !== 'set' &&
    value.operation !== 'remove' &&
    value.operation !== 'clear'
  ) {
    return false;
  }
  if (value.operation === 'set') return record(value.payload);
  if (value.operation === 'remove') {
    return (
      typeof value.payload === 'string' ||
      (Array.isArray(value.payload) &&
        value.payload.every((entry) => typeof entry === 'string'))
    );
  }
  return true;
}

export function isSponsorStorageChangedMessage(
  value: unknown,
): value is SponsorStorageChangedMessage {
  return (
    record(value) &&
    value.type === SPONSOR_STORAGE_CHANGED &&
    isSponsorRuntimeId(value.runtimeId) &&
    isSponsorStorageAreaName(value.areaName) &&
    record(value.changes)
  );
}

export function isSponsorRuntimeMessage(
  value: unknown,
): value is SponsorRuntimeMessage {
  return (
    record(value) &&
    value.type === SPONSOR_RUNTIME_MESSAGE &&
    isSponsorRuntimeId(value.runtimeId) &&
    'payload' in value
  );
}

export function sponsorStorageNamespaceKey(
  runtimeId: SponsorRuntimeId,
  areaName: SponsorStorageAreaName,
) {
  return `sponsor-runtime.${runtimeId}.${areaName}.v1`;
}

export function sponsorRuntimePortName(
  runtimeId: SponsorRuntimeId,
  name: string,
) {
  return `${SPONSOR_RUNTIME_PORT_PREFIX}:${runtimeId}:${name}`;
}

export function parseSponsorRuntimePortName(value: string) {
  const prefix = `${SPONSOR_RUNTIME_PORT_PREFIX}:`;
  if (!value.startsWith(prefix)) return null;
  const remainder = value.slice(prefix.length);
  const separator = remainder.indexOf(':');
  if (separator < 0) return null;
  const runtimeId = remainder.slice(0, separator);
  if (!isSponsorRuntimeId(runtimeId)) return null;
  return {
    runtimeId,
    name: remainder.slice(separator + 1),
  };
}
