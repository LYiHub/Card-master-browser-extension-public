export const USERSCRIPT_SETTINGS_STORAGE_KEY = 'card-master.settings.v1';

export type UserscriptSettings = {
  reloadAfterScriptChange: boolean;
  updateIntervalDays: number;
  updateEnabledOnly: boolean;
  lastUpdateCheckAt: number;
};

export type UserscriptSettingsInput = Pick<
  UserscriptSettings,
  'reloadAfterScriptChange' | 'updateIntervalDays' | 'updateEnabledOnly'
>;

export interface UserscriptSettingsController {
  read(): Promise<UserscriptSettings>;
  write(settings: UserscriptSettingsInput): Promise<UserscriptSettings>;
}

export const DEFAULT_USERSCRIPT_SETTINGS: UserscriptSettings = {
  reloadAfterScriptChange: false,
  updateIntervalDays: 1,
  updateEnabledOnly: true,
  lastUpdateCheckAt: 0,
};

function updateIntervalDays(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_USERSCRIPT_SETTINGS.updateIntervalDays;
  }
  return Math.min(365, Math.max(0, Math.round(value)));
}

export function normalizeUserscriptSettings(
  value: unknown,
): UserscriptSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_USERSCRIPT_SETTINGS };
  }
  const settings = value as Record<string, unknown>;
  return {
    reloadAfterScriptChange:
      typeof settings.reloadAfterScriptChange === 'boolean'
        ? settings.reloadAfterScriptChange
        : DEFAULT_USERSCRIPT_SETTINGS.reloadAfterScriptChange,
    updateIntervalDays: updateIntervalDays(settings.updateIntervalDays),
    updateEnabledOnly:
      typeof settings.updateEnabledOnly === 'boolean'
        ? settings.updateEnabledOnly
        : DEFAULT_USERSCRIPT_SETTINGS.updateEnabledOnly,
    lastUpdateCheckAt:
      typeof settings.lastUpdateCheckAt === 'number' &&
      Number.isFinite(settings.lastUpdateCheckAt) &&
      settings.lastUpdateCheckAt >= 0
        ? settings.lastUpdateCheckAt
        : 0,
  };
}

export function normalizeUserscriptSettingsInput(
  value: unknown,
): UserscriptSettingsInput | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const settings = value as Record<string, unknown>;
  if (
    typeof settings.reloadAfterScriptChange !== 'boolean' ||
    typeof settings.updateIntervalDays !== 'number' ||
    !Number.isFinite(settings.updateIntervalDays) ||
    typeof settings.updateEnabledOnly !== 'boolean'
  ) {
    return null;
  }
  return {
    reloadAfterScriptChange: settings.reloadAfterScriptChange,
    updateIntervalDays: updateIntervalDays(settings.updateIntervalDays),
    updateEnabledOnly: settings.updateEnabledOnly,
  };
}
