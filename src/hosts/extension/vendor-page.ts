import { createMessageReader } from '../../localization/format';
import { getLocale } from '../../localization/locale';
import { initializeLanguagePreference } from '../../localization/preferences';
import type { ExtensionApi } from './api';

type ScriptEntry = Record<string, string>;
type VendorPageScope = typeof globalThis & {
  __cardMasterVendorDocumentReady?: (
    listener: EventListener,
    options?: AddEventListenerOptions | boolean,
  ) => void;
  __cardMasterVendorI18n?: {
    getMessage: ReturnType<typeof createMessageReader>;
    getUILanguage: typeof getLocale;
  };
  __cardMasterSponsorRuntimes?: Record<string, { ready?: Promise<void> }>;
};

async function bootstrap() {
  const api = ((globalThis as typeof globalThis & { browser?: unknown })
    .browser ?? globalThis.chrome) as unknown as ExtensionApi;
  await initializeLanguagePreference(api);
  const response = await fetch(
    api.runtime.getURL(
      `_locales/${getLocale().replace('-', '_')}/messages.json`,
    ),
  );
  if (!response.ok)
    throw new Error(
      `Unable to load extension translations: ${response.status}`,
    );
  const read = createMessageReader(await response.json());
  const bootstrap = document.getElementById('card-master-vendor-bootstrap');
  if (!bootstrap) throw new Error('Vendor page bootstrap is missing.');
  const scripts = JSON.parse(
    bootstrap.dataset.scripts ?? '[]',
  ) as ScriptEntry[];
  (globalThis as VendorPageScope).__cardMasterVendorI18n = {
    getMessage: read,
    getUILanguage: getLocale,
  };
  // Loading translations may finish after DOMContentLoaded; vendor startup must still run once.
  (globalThis as VendorPageScope).__cardMasterVendorDocumentReady = (
    listener,
    options,
  ) => {
    if (document.readyState === 'loading')
      document.addEventListener('DOMContentLoaded', listener, options);
    else
      queueMicrotask(() =>
        listener.call(document, new Event('DOMContentLoaded')),
      );
  };
  document.documentElement.lang = getLocale();
  for (const attributes of scripts) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      for (const [key, value] of Object.entries(attributes))
        script.setAttribute(key, value);
      script.async = false;
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error(`Unable to load vendor script: ${attributes.src}`));
      document.body.append(script);
    });
    const runtimes = (globalThis as VendorPageScope)
      .__cardMasterSponsorRuntimes;
    if (runtimes)
      await Promise.all(
        Object.values(runtimes).map((runtime) => runtime.ready),
      );
  }
}

void bootstrap().catch((error) => {
  console.error('[Card Master] Vendor page startup failed.', error);
});
