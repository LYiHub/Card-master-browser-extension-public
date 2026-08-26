import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  ContextPlaque,
  shouldAnimateContextPlaqueTransition,
} from './ContextPlaque';

describe('ContextPlaque', () => {
  it('keeps explicit animated transitions on the shared GSAP clock', () => {
    expect(shouldAnimateContextPlaqueTransition('animated')).toBe(true);
    expect(shouldAnimateContextPlaqueTransition('immediate')).toBe(false);
    expect(shouldAnimateContextPlaqueTransition('suspended')).toBe(false);
  });

  it('renders the shared ornaments, content states and shortcut structure', () => {
    const markup = renderToStaticMarkup(
      <ContextPlaque
        transition="immediate"
        content={{
          key: 'targeting',
          title: '选择施法指令',
          description: '切换法环选项并确认。',
          stats: ['当前卡牌：时光飞龙'],
          shortcuts: [
            { key: '方向键', label: '选择指令' },
            { key: 'Esc', label: '返回' },
          ],
        }}
      />,
    );

    expect(markup).toContain('context-plaque__ornament--top');
    expect(markup).toContain('context-plaque__ornament--bottom');
    expect(markup).toContain('context-plaque__ornament-layer is-neutral');
    expect(markup).toContain('context-plaque__ornament-layer is-error');
    expect(markup).toContain('context-plaque__content');
    expect(markup).toContain('context-plaque__surface');
    expect(markup).toContain('context-plaque__copy');
    expect(markup).toContain('当前卡牌：时光飞龙');
    expect(markup).toContain('方向键');
    expect(markup).not.toContain('context-plaque__eyebrow');
    expect(markup).not.toContain('context-plaque__sigil');
    expect(markup).not.toContain('style=');
  });

  it('keeps content background and ornament spacing independently adjustable', () => {
    const css = readFileSync(
      new URL('./context-plaque.css', import.meta.url),
      'utf8',
    );

    expect(css).toContain('--context-plaque-content-inset-start: 12px');
    expect(css).toContain('--context-plaque-content-inset-end: 8px');
    expect(css).toContain('--context-plaque-content-inset-inline: 12px');
    expect(css).toContain('--context-plaque-background-overlap-start: 22px');
    expect(css).toContain('--context-plaque-background-overlap-end: 14px');
    expect(css).toContain('--context-plaque-bottom-overlap: 18px');
    expect(css).toContain('--context-plaque-support-gap: 10px');
    expect(css).toContain('--context-plaque-support-height: 26px');
    expect(css).not.toContain('context-plaque__sigil');
    expect(css).not.toContain('context-plaque-rune-turn');
    expect(css).toMatch(
      /margin-top:\s*calc\(-1\s*\*\s*var\(--context-plaque-bottom-overlap\)\)/,
    );
  });

  it('uses one font and one spacing contract across normal and error variants', () => {
    const css = readFileSync(
      new URL('./context-plaque.css', import.meta.url),
      'utf8',
    );
    const shortcutKey = css.match(
      /\.context-plaque__shortcuts kbd\s*\{([^}]*)\}/,
    )?.[1];

    expect(shortcutKey).toContain('font-family: inherit');
    expect(shortcutKey).toContain('font-size: inherit');
    expect(shortcutKey).toContain('line-height: inherit');
    expect(css).toMatch(
      /\.context-plaque\.is-error \.context-plaque__description\s*\{/,
    );
    expect(css).toMatch(
      /\.context-plaque\.is-error \.context-plaque__surface-layer\.is-error\s*\{\s*opacity:\s*1;/,
    );
    expect(css).toContain(
      '.context-plaque.is-error .context-plaque__ornament-layer.is-error',
    );
    expect(css).not.toMatch(
      /\.context-plaque__ornament(?:\s|\{)[^}]*transition:[^}]*filter/s,
    );
    expect(css).not.toContain('context-plaque-error-arrival');
    expect(css).not.toContain('drop-shadow(0 0 18px');
  });

  it('keeps plaque content crisp while swapping states', () => {
    const source = readFileSync(
      new URL('./ContextPlaque.tsx', import.meta.url),
      'utf8',
    );

    expect(source).not.toMatch(/\bscale\s*:/);
    expect(source).not.toContain('{ y: 20, opacity: 0.18');
    expect(source).not.toContain('{ y: -20, opacity: 0.18');
    expect(source).not.toContain('clearProps');
    expect(source).toContain('className="context-plaque__copy"');
    expect(source).toContain("height: 'auto'");
    expect(source).toContain('ref={topOrnamentRef}');
    expect(source).toContain('ref={bottomOrnamentRef}');
  });
});
