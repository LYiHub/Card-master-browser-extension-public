export const MODEL_SERVICE_PRESETS = [
  { id: 'gpt-5.5' },
  { id: 'gpt-5.6-sol' },
  { id: 'gpt-5.6-terra' },
  { id: 'gpt-5.6-luna' },
  { id: 'deepseek-v4-flash' },
  { id: 'deepseek-v4-pro' },
] as const;

export const MODEL_SERVICE_BASE_URL_PRESETS = [
  { url: 'https://api.openai.com/v1', label: 'OpenAI' },
  { url: 'https://api.deepseek.com', label: 'DeepSeek' },
] as const;

export const DEFAULT_MODEL_SERVICE_MODEL =
  'deepseek-v4-flash' satisfies (typeof MODEL_SERVICE_PRESETS)[number]['id'];
export type AiModelProtocol = 'responses' | 'chat-completions';

export function isAiModelProtocol(value: unknown): value is AiModelProtocol {
  return value === 'responses' || value === 'chat-completions';
}
