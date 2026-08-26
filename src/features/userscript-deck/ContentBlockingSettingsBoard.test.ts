import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('ContentBlockingSettingsBoard', () => {
  it('uses the shared loader for operations and an info icon for success', () => {
    const source = readFileSync(
      new URL('./ContentBlockingSettingsBoard.tsx', import.meta.url),
      'utf8',
    );

    expect(source).toContain('activeOperations.size > 0');
    expect(source).toContain('className="manager-blocking-operation-loader"');
    expect(source).toContain(
      '{!status.error && <Info size={15} aria-hidden="true" />}',
    );
  });
});
