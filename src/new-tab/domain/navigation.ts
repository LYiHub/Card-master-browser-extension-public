import type { NewTabNavigationTarget } from './types';

function directNavigationHost(input: string) {
  const withoutScheme = input.replace(/^https?:\/\//i, '');
  const authority = withoutScheme.split(/[/?#]/)[0] ?? '';
  if (authority.startsWith('[')) {
    const bracket = authority.indexOf(']');
    return bracket > 1 ? authority.slice(1, bracket).toLocaleLowerCase() : '';
  }
  if (authority.includes('::') && !authority.includes('.')) {
    return authority.toLocaleLowerCase();
  }
  return (authority.split(':')[0] ?? '').toLocaleLowerCase();
}

function numericHost(host: string) {
  if (!host) return false;
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
  const parts = host.split('.');
  if (!parts.every((part) => /^\d{1,3}$/.test(part))) return false;
  if (parts.length === 1) return parts[0] === '127';
  return parts.every((part) => Number(part) <= 255);
}

function developmentHost(host: string) {
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === 'host.docker.internal' ||
    host.endsWith('.local') ||
    host.endsWith('.test') ||
    host.endsWith('.localdev') ||
    host.endsWith('.internal') ||
    host === '::1' ||
    host === '0:0:0:0:0:0:0:1'
  );
}

export function resolveNewTabNavigationTarget(
  input: string,
): NewTabNavigationTarget | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^https?:\/\/\S+$/i.test(raw)) {
    try {
      return { kind: 'url', value: new URL(raw).toString() };
    } catch {
      return { kind: 'search', value: raw };
    }
  }
  let normalized =
    /^(\d{1,3})([.\s]\d{1,3}){0,3}(?::\d{1,5})?(?:[/?#].*)?$/.test(raw)
      ? raw.replace(/\s+/g, '.').replace(/\.{2,}/g, '.')
      : raw;
  const host = directNavigationHost(normalized);
  if (
    normalized.includes(' ') ||
    (!normalized.includes('.') && !developmentHost(host) && !numericHost(host))
  ) {
    return { kind: 'search', value: raw };
  }
  if (
    host.includes(':') &&
    !normalized.startsWith('[') &&
    !/^https?:\/\//i.test(normalized)
  ) {
    normalized = `[${normalized}]`;
  }
  try {
    return {
      kind: 'url',
      value: new URL(`https://${normalized}`).toString(),
    };
  } catch {
    return { kind: 'search', value: raw };
  }
}
