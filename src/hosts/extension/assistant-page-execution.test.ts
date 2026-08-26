import { describe, expect, it } from 'vitest';

import {
  assistantPageExecutionSource,
  boundedAssistantPageExecutionOutput,
  validateAssistantPageExpression,
} from './assistant-page-execution';

describe('assistant page execution', () => {
  it('builds the QuillMonkey-style one-shot expression wrapper', () => {
    const source = assistantPageExecutionSource(
      '(() => { document.querySelector("button")?.click(); return 7; })()',
    );

    expect(source).toContain('document.querySelector("button")?.click()');
    expect(source).toContain('const result = (');
    expect(source).toContain('console.log = capture("log")');
    expect(source).toContain('console.log = originalConsole.log');
    expect(source).toContain('success: true');
    expect(source).toContain('success: false');
  });

  it('rejects empty and oversized expressions', () => {
    expect(() => validateAssistantPageExpression('')).toThrow(
      'expression 必须是非空字符串',
    );
    expect(() =>
      validateAssistantPageExpression('x'.repeat(64 * 1024 + 1)),
    ).toThrow('expression 必须是非空字符串');
  });

  it('bounds tool output before it returns to the model', () => {
    expect(
      boundedAssistantPageExecutionOutput({ success: true, result: 7 }),
    ).toBe('{"success":true,"result":7}');
    expect(
      JSON.parse(
        boundedAssistantPageExecutionOutput({
          success: true,
          result: 'x'.repeat(70 * 1024),
        }),
      ),
    ).toMatchObject({
      success: false,
      truncated: true,
    });
  });
});
