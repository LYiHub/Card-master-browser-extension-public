import { describe, expect, it } from 'vitest';

import {
  DEFAULT_USERSCRIPT_SETTINGS,
  normalizeUserscriptSettings,
  normalizeUserscriptSettingsInput,
} from './settings';

describe('userscript settings', () => {
  it('uses immediate injection without automatic reload by default', () => {
    expect(normalizeUserscriptSettings(null)).toEqual(
      DEFAULT_USERSCRIPT_SETTINGS,
    );
  });

  it('keeps explicit reload and automatic-update settings', () => {
    expect(
      normalizeUserscriptSettings({
        reloadAfterScriptChange: true,
        updateIntervalDays: 0,
        updateEnabledOnly: false,
        lastUpdateCheckAt: 42,
      }),
    ).toEqual({
      reloadAfterScriptChange: true,
      updateIntervalDays: 0,
      updateEnabledOnly: false,
      lastUpdateCheckAt: 42,
    });
  });

  it('normalizes bounded intervals and rejects malformed input', () => {
    expect(
      normalizeUserscriptSettingsInput({
        reloadAfterScriptChange: false,
        updateIntervalDays: 2.6,
        updateEnabledOnly: true,
      }),
    ).toEqual({
      reloadAfterScriptChange: false,
      updateIntervalDays: 3,
      updateEnabledOnly: true,
    });
    expect(
      normalizeUserscriptSettingsInput({
        reloadAfterScriptChange: false,
        updateIntervalDays: '1',
        updateEnabledOnly: true,
      }),
    ).toBeNull();
  });
});
