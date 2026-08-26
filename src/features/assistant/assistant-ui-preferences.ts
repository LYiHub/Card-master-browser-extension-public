import type { ExtensionApi } from '../../hosts/extension/api';

export const ASSISTANT_UI_PREFERENCES_STORAGE_KEY =
  'assistant-ui.preferences.v1';

export type AssistantUiPreferences = {
  version: 1;
  pinnedConversationIds: string[];
};

export function defaultAssistantUiPreferences(): AssistantUiPreferences {
  return {
    version: 1,
    pinnedConversationIds: [],
  };
}

export function normalizeAssistantUiPreferences(
  value: unknown,
): AssistantUiPreferences {
  const defaults = defaultAssistantUiPreferences();
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return defaults;
  }
  const candidate = value as Partial<AssistantUiPreferences>;
  return {
    version: 1,
    pinnedConversationIds: Array.isArray(candidate.pinnedConversationIds)
      ? [
          ...new Set(
            candidate.pinnedConversationIds.filter(
              (id): id is string => typeof id === 'string' && id.length <= 256,
            ),
          ),
        ].slice(0, 1_000)
      : [],
  };
}

export async function readAssistantUiPreferences(api: ExtensionApi) {
  const stored = (
    await api.storage.local.get(ASSISTANT_UI_PREFERENCES_STORAGE_KEY)
  )[ASSISTANT_UI_PREFERENCES_STORAGE_KEY];
  return normalizeAssistantUiPreferences(stored);
}

export async function writeAssistantUiPreferences(
  api: ExtensionApi,
  preferences: AssistantUiPreferences,
) {
  const normalized = normalizeAssistantUiPreferences(preferences);
  await api.storage.local.set({
    [ASSISTANT_UI_PREFERENCES_STORAGE_KEY]: normalized,
  });
  return normalized;
}
