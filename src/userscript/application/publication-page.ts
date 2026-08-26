import type { InstalledUserscript } from '../domain/types';

const SCRIPT_FILE_SUFFIX = /(?:\.min)?\.(?:user|meta)\.js$/i;

function httpUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

function scriptIdFromPath(url: URL) {
  const segments = url.pathname.split('/').filter(Boolean);
  const scriptsIndex = segments.indexOf('scripts');
  const id =
    scriptsIndex >= 0
      ? /^(\d+)/.exec(segments[scriptsIndex + 1] ?? '')?.[1]
      : null;
  return id ?? null;
}

function marketplacePage(value: string | undefined) {
  const url = httpUrl(value);
  if (!url) return null;
  const host = url.hostname.toLowerCase();

  if (
    host === 'greasyfork.org' ||
    host === 'update.greasyfork.org' ||
    host === 'sleazyfork.org' ||
    host === 'update.sleazyfork.org'
  ) {
    const id = scriptIdFromPath(url);
    if (!id) return null;
    return `https://${host.replace(/^update\./, '')}/scripts/${id}`;
  }

  if (host === 'scriptcat.org') {
    const id =
      /^\/scripts\/code\/(\d+)(?:\/|$)/.exec(url.pathname)?.[1] ??
      /^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?script-show-page\/(\d+)(?:\/|$)/.exec(
        url.pathname,
      )?.[1];
    return id ? `https://scriptcat.org/zh-CN/script-show-page/${id}` : null;
  }

  if (host === 'openuserjs.org') {
    const match = /^\/(?:install|scripts)\/([^/]+)\/([^/]+)/.exec(url.pathname);
    if (!match) return null;
    const [, author, rawName] = match;
    const name = rawName.replace(SCRIPT_FILE_SUFFIX, '');
    return name ? `https://openuserjs.org/scripts/${author}/${name}` : null;
  }

  return null;
}

function projectPage(value: string | undefined) {
  const url = httpUrl(value);
  if (!url) return null;
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);

  if (host === 'raw.githubusercontent.com' && segments.length >= 2) {
    return `https://github.com/${segments[0]}/${segments[1]}`;
  }

  if (host === 'github.com' && segments.length >= 2) {
    return `https://github.com/${segments[0]}/${segments[1]}`;
  }

  if (
    host === 'cdn.jsdelivr.net' &&
    segments[0] === 'gh' &&
    segments.length >= 3
  ) {
    const repository = segments[2].split('@')[0];
    return repository
      ? `https://github.com/${segments[1]}/${repository}`
      : null;
  }

  return null;
}

function declaredHomepage(value: string | undefined) {
  const url = httpUrl(value);
  if (!url || SCRIPT_FILE_SUFFIX.test(url.pathname)) return null;
  return url.href;
}

export function userscriptPublicationPageUrl(script: InstalledUserscript) {
  const sources = [
    script.source.origin,
    script.metadata.downloadUrl,
    script.metadata.updateUrl,
    script.metadata.homepageUrl,
  ];

  for (const source of sources) {
    const page = marketplacePage(source);
    if (page) return page;
  }

  const homepage = declaredHomepage(script.metadata.homepageUrl);
  if (homepage) return homepage;

  for (const source of sources) {
    const page = projectPage(source);
    if (page) return page;
  }

  return null;
}

export function userscriptSourcePageUrl(script: InstalledUserscript) {
  return (
    userscriptPublicationPageUrl(script) ??
    httpUrl(script.source.origin)?.href ??
    null
  );
}
