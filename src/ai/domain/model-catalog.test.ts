import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MODEL_SERVICE_MODEL,
  isAiModelProtocol,
  MODEL_SERVICE_BASE_URL_PRESETS,
  MODEL_SERVICE_PRESETS,
} from './model-catalog';

describe('AI model catalog', () => {
  it('contains the suggested model ids without provider metadata', () => {
    const ids = MODEL_SERVICE_PRESETS.map((model) => model.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual([
      'gpt-5.5',
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
      'deepseek-v4-flash',
      'deepseek-v4-pro',
    ]);
    expect(
      MODEL_SERVICE_PRESETS.every(
        (model) =>
          Object.keys(model).length === 1 && Object.hasOwn(model, 'id'),
      ),
    ).toBe(true);
    expect(DEFAULT_MODEL_SERVICE_MODEL).toBe('deepseek-v4-flash');
  });

  it('provides official base URL suggestions without restricting custom endpoints', () => {
    expect(MODEL_SERVICE_BASE_URL_PRESETS).toEqual([
      { url: 'https://api.openai.com/v1', label: 'OpenAI' },
      { url: 'https://api.deepseek.com', label: 'DeepSeek' },
    ]);
  });

  it('recognizes the two generic API formats', () => {
    expect(isAiModelProtocol('responses')).toBe(true);
    expect(isAiModelProtocol('chat-completions')).toBe(true);
    expect(isAiModelProtocol('provider-specific')).toBe(false);
    expect(isAiModelProtocol('unknown')).toBe(false);
  });
});
