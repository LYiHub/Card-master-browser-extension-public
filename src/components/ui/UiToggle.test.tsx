import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UiToggle } from './Ui';

describe('UiToggle', () => {
  it('exposes explicit checked and unchecked states', () => {
    const checked = renderToStaticMarkup(
      <UiToggle label="已启用" checked compact onChange={() => undefined} />,
    );
    const unchecked = renderToStaticMarkup(
      <UiToggle label="已关闭" checked={false} onChange={() => undefined} />,
    );

    expect(checked).toContain('role="switch"');
    expect(checked).toContain('aria-checked="true"');
    expect(checked).toContain('is-checked');
    expect(checked).toContain('is-compact');
    expect(checked).toContain('<b>开</b>');
    expect(unchecked).toContain('aria-checked="false"');
    expect(unchecked).not.toContain('is-checked');
    expect(unchecked).toContain('<b>关</b>');
  });

  it('uses high-contrast CSS states without legacy image assets', () => {
    const css = readFileSync(new URL('./toggle.css', import.meta.url), 'utf8');

    expect(css).toContain('.app-ui-toggle.is-checked');
    expect(css).toContain('var(--app-ui-success)');
    expect(css).toContain('border-radius: 50%');
    expect(css).not.toContain('toggle-track.webp');
    expect(css).not.toContain('toggle-knob.webp');
  });
});
