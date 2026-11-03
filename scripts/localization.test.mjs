import { describe, expect, it } from 'vitest';
import { readCoreCatalogs, validateCatalogs } from './localization.mjs';

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
});
