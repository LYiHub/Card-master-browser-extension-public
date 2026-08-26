import type { InstalledUserscript } from '../domain/types';

function hexadecimal(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
}

export async function userscriptSourceRevision(script: InstalledUserscript) {
  const payload = JSON.stringify({
    id: script.id,
    source: script.source,
  });
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(payload),
  );
  return `sha256:${hexadecimal(digest)}`;
}
