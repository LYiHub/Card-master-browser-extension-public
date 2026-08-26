import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const THEME_CSS = readFileSync(new URL('./theme.css', import.meta.url), 'utf8');

function declarationBlock(marker: string) {
  const markerIndex = THEME_CSS.indexOf(marker);
  if (markerIndex < 0) throw new Error(`找不到主题选择器：${marker}`);
  const openingBrace = THEME_CSS.indexOf('{', markerIndex);
  if (openingBrace < 0) throw new Error(`主题选择器缺少声明块：${marker}`);

  let depth = 0;
  for (let index = openingBrace; index < THEME_CSS.length; index += 1) {
    if (THEME_CSS[index] === '{') depth += 1;
    if (THEME_CSS[index] !== '}') continue;
    depth -= 1;
    if (depth === 0) return THEME_CSS.slice(openingBrace + 1, index);
  }
  throw new Error(`主题选择器声明块没有闭合：${marker}`);
}

function declarations(block: string) {
  return new Map(
    [...block.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((match) => [
      match[1],
      match[2].trim(),
    ]),
  );
}

const baseTheme = declarations(declarationBlock('.app-ui-theme {'));

function resolvedToken(name: string, seen = new Set<string>()): string {
  if (seen.has(name)) throw new Error(`主题令牌循环引用：${name}`);
  const value = baseTheme.get(name);
  if (!value) throw new Error(`缺少主题令牌：${name}`);
  const reference = value.match(/^var\(--([\w-]+)\)$/);
  if (!reference) return value;
  seen.add(name);
  return resolvedToken(reference[1], seen);
}

function luminance(color: string) {
  const match = color.match(/^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!match) {
    throw new Error(`对比度测试只接受六位十六进制颜色：${color}`);
  }
  const channels = match.slice(1).map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const [red, green, blue] = channels;
  if (red === undefined || green === undefined || blue === undefined) {
    throw new Error(`颜色通道不完整：${color}`);
  }
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function contrastRatio(foreground: string, background: string) {
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('暗夜界面文字对比度', () => {
  it('只维护一套固定深色令牌', () => {
    expect(THEME_CSS).not.toContain('data-app-ui-theme');
    expect(THEME_CSS).not.toContain('.app-ui-theme.is-dark');
    expect(declarationBlock('.app-ui-theme {')).toContain('color-scheme: dark');
  });

  it('在所有共享暗色表面保持清晰的语义层级', () => {
    const textThresholds = new Map([
      ['app-ui-ink', 13.5],
      ['app-ui-muted', 10],
      ['app-ui-subtle', 7],
      ['app-ui-disabled', 5],
    ]);
    const backgrounds = [
      'app-ui-canvas',
      'app-ui-surface',
      'app-ui-surface-strong',
      'app-ui-surface-muted',
      'app-ui-control',
      'app-ui-list',
      'app-ui-card',
    ];
    const violations: string[] = [];

    for (const [textToken, threshold] of textThresholds) {
      for (const backgroundToken of backgrounds) {
        const ratio = contrastRatio(
          resolvedToken(textToken),
          resolvedToken(backgroundToken),
        );
        if (ratio < threshold) {
          violations.push(
            `${textToken}/${backgroundToken}: ${ratio.toFixed(2)} < ${threshold}`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('不会再用过低的整体透明度隐藏不可用控件文字', () => {
    expect(
      Number(resolvedToken('app-ui-disabled-opacity')),
    ).toBeGreaterThanOrEqual(0.64);
  });
});
