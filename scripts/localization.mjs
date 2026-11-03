import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const APP_LOCALES = ['zh_CN', 'zh_TW'];

function signature(record) {
  const tokens = [...record.message.matchAll(/\$\$|\$\d+|\$[a-z0-9_]+\$/gi)]
    .map(([token]) => token.toLowerCase())
    .filter((token) => token !== '$$');
  const placeholders = Object.entries(record.placeholders ?? {}).map(
    ([key, value]) => `${key.toLowerCase()}:${value.content}`,
  );
  return [...new Set([...tokens, ...placeholders])].sort().join('\n');
}

export function validateCatalogs(catalogs) {
  const source = catalogs.zh_CN;
  const keys = Object.keys(source).sort();
  for (const locale of APP_LOCALES) {
    const catalog = catalogs[locale];
    if (JSON.stringify(Object.keys(catalog).sort()) !== JSON.stringify(keys)) {
      throw new Error(`Localization keys differ: ${locale}`);
    }
    const names = new Set();
    for (const [key, record] of Object.entries(catalog)) {
      if (!/^cm_[a-z0-9_]+$/.test(key) || names.has(key.toLowerCase())) {
        throw new Error(`Invalid localization key: ${locale}/${key}`);
      }
      names.add(key.toLowerCase());
      if (typeof record?.message !== 'string' || !record.message.trim()) {
        throw new Error(`Empty localization message: ${locale}/${key}`);
      }
      for (const [, name] of record.message.matchAll(
        /\$([a-z_][a-z0-9_]*)\$/gi,
      )) {
        const placeholder = Object.entries(record.placeholders ?? {}).find(
          ([key]) => key.toLowerCase() === name.toLowerCase(),
        )?.[1];
        if (typeof placeholder?.content !== 'string') {
          throw new Error(`Undefined placeholder: ${locale}/${key}/${name}`);
        }
      }
      if (signature(record) !== signature(source[key])) {
        throw new Error(`Localization placeholders differ: ${locale}/${key}`);
      }
    }
  }
}

export async function readCoreCatalogs(root) {
  const catalogs = Object.fromEntries(
    await Promise.all(
      APP_LOCALES.map(async (locale) => [
        locale,
        JSON.parse(
          await readFile(
            resolve(root, `src/locales/${locale}/messages.json`),
            'utf8',
          ),
        ),
      ]),
    ),
  );
  validateCatalogs(catalogs);
  return catalogs;
}

export async function mergeCoreLocales(root, output) {
  const catalogs = await readCoreCatalogs(root);
  const source = JSON.parse(
    await readFile(resolve(output, '_locales/zh_CN/messages.json'), 'utf8'),
  );
  for (const locale of APP_LOCALES) {
    const path = resolve(output, `_locales/${locale}`);
    await mkdir(path, { recursive: true });
    const existing = await readFile(resolve(path, 'messages.json'), 'utf8')
      .then(JSON.parse)
      .catch((error) => {
        if (error.code === 'ENOENT') return source;
        throw error;
      });
    for (const key of Object.keys(catalogs[locale])) {
      if (key in existing)
        throw new Error(`Duplicate localization key: ${locale}/${key}`);
    }
    await writeFile(
      resolve(path, 'messages.json'),
      `${JSON.stringify({ ...existing, ...catalogs[locale] })}\n`,
    );
  }
}
