export function extendThemeCacheKeys(_keys: unknown[]) {}

function unavailable(): never {
  throw new Error('Dark Reader Plus extensions are not part of this build.');
}

export function getBackgroundPoles(_theme: unknown): [string, string] {
  return unavailable();
}

export function getTextPoles(_theme: unknown): [string, string] {
  return unavailable();
}

export function modifyBgColorExtended<T>(
  _hsl: T,
  _pole: unknown,
  _anotherPole: unknown,
): T {
  return unavailable();
}

export function modifyFgColorExtended<T>(
  _hsl: T,
  _pole: unknown,
  _anotherPole: unknown,
): T {
  return unavailable();
}

export function modifyLightSchemeColorExtended<T>(
  _hsl: T,
  _pole: unknown,
  _anotherPole: unknown,
): T {
  return unavailable();
}
