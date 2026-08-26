import { getDomain } from 'tldts';

const ROOT_DOMAIN_OPTIONS = { allowPrivateDomains: true } as const;

export type SiteScope = {
  host: string;
  matchPattern: string;
};

export function resolveSiteScope(rawUrl: string): SiteScope | null {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLocaleLowerCase();
    if (!hostname) return null;
    const domain = getDomain(hostname, ROOT_DOMAIN_OPTIONS);
    const host = domain ?? hostname;
    return {
      host,
      matchPattern: domain ? `*://*.${domain}/*` : `*://${hostname}/*`,
    };
  } catch {
    return null;
  }
}
