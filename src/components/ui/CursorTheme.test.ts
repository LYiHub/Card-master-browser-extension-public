import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('shared cursor theme', () => {
  it('owns the cursor assets and semantic interaction states globally', () => {
    const css = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');

    expect(css).toContain('--app-ui-cursor-default');
    expect(css).toContain('--app-ui-cursor-pointer');
    expect(css).toContain('visual/cursors/default.png');
    expect(css).toContain('visual/cursors/pointer.png');
    expect(css).toContain(':is(:root, :host, .app-ui-theme)');
    expect(css).toContain('button:not(:disabled)');
    expect(css).toContain('input:disabled');
    expect(css).toContain('[contenteditable="true"]');
  });
});
