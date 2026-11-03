import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export function localizeVendorPage(html, loaderUrl) {
  const scripts = [];
  const source = html.replace(
    /<!--[\s\S]*?-->|<script\b([^>]*)>\s*<\/script>/gi,
    (tag, attributes) => {
      if (tag.startsWith('<!--')) return tag;
      const record = Object.fromEntries(
        [...attributes.matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g)].map(
          ([, key, value]) => [key, value],
        ),
      );
      if (!record.src) return tag;
      scripts.push(record);
      return '';
    },
  );
  if (!scripts.length) throw new Error('Vendor page has no external scripts.');
  const encoded = JSON.stringify(scripts)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');
  return source.replace(
    '</body>',
    `<script id="card-master-vendor-bootstrap" src="${loaderUrl}" data-scripts="${encoded}"></script>\n</body>`,
  );
}

export async function prepareVendorPageLanguages(output) {
  const lumnoPath = resolve(output, 'src/newtab/newtab.js');
  const lumno = await readFile(lumnoPath, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  if (lumno) {
    const needle =
      "const targetLocale = currentLanguageMode === 'system' ? getSystemLocale() : normalizeLocale(currentLanguageMode);";
    if (!lumno.includes(needle))
      throw new Error('Lumno language mode target is missing.');
    const patched = lumno
      .replace(
        'function applyLanguageMode(mode) {',
        'async function applyLanguageMode(mode) {',
      )
      .replace(
        needle,
        `const storedLanguage = await chrome.storage.local.get('card-master.language.v1');
    const preference = storedLanguage['card-master.language.v1'];
    const targetLocale = preference === 'zh-TW' ? 'zh_TW' : preference === 'zh-CN' ? 'zh_CN' : getSystemLocale() === 'zh_TW' ? 'zh_TW' : 'zh_CN';`,
      )
      .replace(
        'currentMessages = messages || {};',
        'currentMessages = messages || {}; globalThis.__cardMasterLumnoMessages = currentMessages;',
      );
    await writeFile(lumnoPath, patched);
    const switcherPath = resolve(output, 'src/overlay/tab-switcher.js');
    const switcher = await readFile(switcherPath, 'utf8');
    await writeFile(
      switcherPath,
      switcher.replace(
        'chrome.i18n.getMessage(key)',
        '(globalThis.__cardMasterLumnoMessages?.[key]?.message || chrome.i18n.getMessage(key))',
      ),
    );
  }
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) await visit(path);
      else if (entry.name.endsWith('.html')) {
        const html = await readFile(path, 'utf8');
        if (/<script\b[^>]*\bsrc=/.test(html)) {
          const depth = path.slice(output.length + 1).split('/').length - 1;
          await writeFile(
            path,
            localizeVendorPage(html, `${'../'.repeat(depth)}vendor-page.js`),
          );
        }
      }
    }
  }
  for (const directory of [
    'vendor/bilibili/sponsor',
    'vendor/youtube/sponsor',
  ]) {
    await visit(resolve(output, directory)).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
  for (const page of [
    'popup',
    'options',
    'downloader',
    'json',
    'm3u8',
    'mpd',
    'preview',
  ]) {
    const path = resolve(output, `${page}.html`);
    const html = await readFile(path, 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (html) await writeFile(path, localizeVendorPage(html, 'vendor-page.js'));
  }
}
