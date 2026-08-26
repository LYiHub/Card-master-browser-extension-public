import { syncSafariBranding } from './safari-branding.mjs';

const changed = await syncSafariBranding();
console.log(
  changed.length === 0
    ? 'Safari branding already matches the Card Master logo.'
    : `Synchronized ${changed.length} Safari branding assets.`,
);
