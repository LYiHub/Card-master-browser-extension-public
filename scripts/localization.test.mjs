import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  readCoreCatalogs,
  scopedLocalizationPlugin,
  validateCatalogs,
} from './localization.mjs';

describe('localization catalogs', () => {
  it('validates the complete paired application catalogs', async () => {
    const catalogs = await readCoreCatalogs(process.cwd());
    expect(catalogs.zh_TW.cm_extension_name.message).toBe('卡牌大師');
  });

  it('rejects missing keys, empty translations and changed placeholders', () => {
    const source = {
      cm_example: {
        message: '值 $VALUE$',
        placeholders: { value: { content: '$1' } },
      },
    };
    expect(() => validateCatalogs({ zh_CN: source, zh_TW: {} })).toThrow(
      'keys differ',
    );
    expect(() =>
      validateCatalogs({
        zh_CN: source,
        zh_TW: { cm_example: { message: '' } },
      }),
    ).toThrow('Empty');
    expect(() =>
      validateCatalogs({
        zh_CN: source,
        zh_TW: { cm_example: { message: '值 $MISSING$' } },
      }),
    ).toThrow('Undefined');
    expect(() =>
      validateCatalogs({
        zh_CN: source,
        zh_TW: { cm_example: { message: '值 $2' } },
      }),
    ).toThrow('placeholders differ');
  });

  it('bundles only literal keys needed by a source module without translator metadata', async () => {
    const plugin = await scopedLocalizationPlugin(process.cwd());
    const result = plugin.transform(
      "import { t } from '../localization/messages'; export const label = () => t('cm_language_title');",
      resolve('src/features/Fixture.tsx'),
    );
    const virtual = result.code.match(/from "([^"]+)"/)[1];
    const code = plugin.load(plugin.resolveId(virtual));
    expect(code).toContain('介面語言');
    expect(code).not.toContain('cm_extension_description');
    expect(code).not.toContain('description');
    expect(
      plugin.transform(
        'export const plain = 1;',
        resolve('src/features/Plain.ts'),
      ),
    ).toBeNull();
  });

  it('retains the full dictionary when a typed key is selected dynamically', async () => {
    const plugin = await scopedLocalizationPlugin(process.cwd());
    const result = plugin.transform(
      "import { t } from '../localization/messages'; export const label = (key) => t(key);",
      resolve('src/features/Fixture.tsx'),
    );
    const virtual = result.code.match(/from "([^"]+)"/)[1];
    expect(plugin.load(plugin.resolveId(virtual))).toContain(
      'cm_extension_description',
    );
  });
});
