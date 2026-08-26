const PAGE_LIFECYCLE_INTERRUPTED =
  /(?:back\/forward cache|page keeping the extension port|message channel (?:is )?closed|port (?:is )?closed|receiving end does not exist|could not establish connection|extension context (?:has been )?invalidated|no tab with id|invalid tab id|no frame with id|frame with id .* (?:was removed|is showing error page)|the frame was removed|the tab was closed)/i;
const EXTENSION_STORAGE_SPACE_FAILURE =
  /(?:FILE_ERROR_NO_SPACE|QUOTA_BYTES|QuotaExceededError)/iu;

function readProperty(error: object, key: PropertyKey) {
  try {
    return Reflect.get(error, key);
  } catch {
    return undefined;
  }
}

function errorMessage(error: unknown, seen: Set<unknown>): string {
  if (error instanceof Error) {
    if (seen.has(error)) return error.message;
    seen.add(error);
    const cause = readProperty(error, 'cause');
    if (cause && cause !== error) {
      const causeMessage = errorMessage(cause, seen);
      if (
        causeMessage &&
        causeMessage !== error.message &&
        !error.message.includes(causeMessage)
      ) {
        return error.message.trim()
          ? `${error.message.trim()} ${causeMessage}`
          : causeMessage;
      }
    }
    return error.message;
  }
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    if (seen.has(error)) return '';
    seen.add(error);
    for (const key of ['message', 'error', 'lastError', 'reason']) {
      const value = readProperty(error, key);
      if (typeof value === 'string' && value.trim()) return value;
      if (value && value !== error) {
        const nested = errorMessage(value, seen);
        if (nested && nested !== '[object Object]') return nested;
      }
    }
    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== '{}') return serialized;
    } catch {
      // The structured diagnostic retains the object's shape below.
    }
  }
  const message = String(error);
  return message === '[object Object]'
    ? 'Unknown extension runtime error.'
    : message;
}

export function extensionErrorMessage(error: unknown): string {
  return errorMessage(error, new Set());
}

export function isExtensionStorageSpaceFailure(error: unknown) {
  return EXTENSION_STORAGE_SPACE_FAILURE.test(extensionErrorMessage(error));
}

function ownKeys(error: object) {
  try {
    return Reflect.ownKeys(error).map(String);
  } catch {
    return [];
  }
}

function serializedError(error: unknown) {
  try {
    const serialized = JSON.stringify(error);
    return serialized && serialized !== '{}' ? serialized : undefined;
  } catch {
    return undefined;
  }
}

export function extensionErrorDetails(error: unknown) {
  const objectError = error && typeof error === 'object' ? error : null;
  const name = objectError ? readProperty(objectError, 'name') : undefined;
  const stack = objectError ? readProperty(objectError, 'stack') : undefined;
  const code = objectError ? readProperty(objectError, 'code') : undefined;
  let constructorName: string | undefined;
  try {
    constructorName = objectError?.constructor?.name;
  } catch {
    constructorName = undefined;
  }

  return {
    type: typeof error,
    constructor: constructorName,
    name: typeof name === 'string' ? name : undefined,
    message: extensionErrorMessage(error),
    stack: typeof stack === 'string' ? stack : undefined,
    code:
      typeof code === 'string' || typeof code === 'number' ? code : undefined,
    ownKeys: objectError ? ownKeys(objectError) : [],
    serialized: serializedError(error),
    raw: error,
  };
}

export function isExtensionPageLifecycleInterrupted(error: unknown) {
  return PAGE_LIFECYCLE_INTERRUPTED.test(extensionErrorMessage(error));
}
