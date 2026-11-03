import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

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

export async function scopedLocalizationPlugin(root) {
  const catalogs = await readCoreCatalogs(root);
  const modules = new Map();
  const prefix = 'virtual:card-master-localization:';
  return {
    name: 'card-master-scoped-localization',
    enforce: 'pre',
    resolveId(id) {
      return id.startsWith(prefix) ? `\0${id}` : null;
    },
    load(id) {
      return modules.get(id) ?? null;
    },
    transform(code, id) {
      if (!/\.tsx?$/.test(id) || !code.includes('localization/messages'))
        return null;
      const pattern = /import\s*\{\s*t\s*\}\s*from\s*(['"])([^'"]+)\1;?/g;
      let changed = false;
      const transformed = code.replace(
        pattern,
        (declaration, _quote, source) => {
          if (
            resolve(dirname(id), source).replace(/\.ts$/, '') !==
            resolve(root, 'src/localization/messages')
          )
            return declaration;
          const calls = [...code.matchAll(/\bt\s*\(/g)];
          const literals = [
            ...code.matchAll(/\bt\s*\(\s*(['"])(cm_[a-z0-9_]+)\1/g),
          ];
          // Dynamic typed keys need the complete catalog; literal calls can be scoped safely.
          const keys =
            calls.length === literals.length
              ? [...new Set(literals.map((match) => match[2]))]
              : Object.keys(catalogs.zh_CN);
          const compact = (catalog) =>
            Object.fromEntries(
              keys.map((key) => {
                const record = catalog[key];
                if (!record)
                  throw new Error(`Unknown localization key in ${id}: ${key}`);
                return [
                  key,
                  {
                    message: record.message,
                    ...(record.placeholders
                      ? { placeholders: record.placeholders }
                      : {}),
                  },
                ];
              }),
            );
          const moduleId = `${prefix}${encodeURIComponent(id)}`;
          modules.set(
            `\0${moduleId}`,
            [
              `import { createMessageReader } from ${JSON.stringify(resolve(root, 'src/localization/format.ts'))};`,
              `import { getLocale } from ${JSON.stringify(resolve(root, 'src/localization/locale.ts'))};`,
              `const readers = { 'zh-CN': createMessageReader(${JSON.stringify(compact(catalogs.zh_CN))}), 'zh-TW': createMessageReader(${JSON.stringify(compact(catalogs.zh_TW))}) };`,
              'export function t(key, substitutions) { return readers[getLocale()](key, substitutions); }',
            ].join('\n'),
          );
          changed = true;
          return `import { t } from ${JSON.stringify(moduleId)};`;
        },
      );
      return changed ? { code: transformed, map: null } : null;
    },
  };
}
