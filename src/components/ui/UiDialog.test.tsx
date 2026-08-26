import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  UI_DIALOG_STATUS_TONES,
  UiDialog,
  UiLayeredCompactDialog,
  UiSegmentedControl,
} from './Ui';

function cssFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return cssFiles(path);
    return entry.isFile() && entry.name.endsWith('.css') ? [path] : [];
  });
}

describe('UiDialog frame contract', () => {
  it('separates the single square modal from the compact dialog component', () => {
    const square = renderToStaticMarkup(
      <UiDialog ariaLabel="主模态框" title="主模态框" onClose={() => undefined}>
        <p>内容</p>
      </UiDialog>,
    );
    const landscape = renderToStaticMarkup(
      <UiLayeredCompactDialog
        open
        ariaLabel="紧凑对话框"
        title="紧凑对话框"
        onClose={() => undefined}
      >
        <p>内容</p>
      </UiLayeredCompactDialog>,
    );

    expect(square).toContain('data-dialog-frame="square"');
    expect(square).not.toContain('app-ui-dialog--compact');
    expect(landscape).toContain('data-dialog-frame="compact"');
    expect(landscape).toContain('app-ui-dialog--compact');
    expect(square).not.toContain('app-ui-dialog__eyebrow');
    expect(landscape).not.toContain('app-ui-dialog__eyebrow');
  });

  it('keeps modal navigation outside the scrolling body', () => {
    const markup = renderToStaticMarkup(
      <UiDialog
        ariaLabel="设置"
        title="设置"
        navigation={
          <UiSegmentedControl
            label="设置分类"
            value="general"
            options={[
              { value: 'general', label: '常规' },
              { value: 'advanced', label: '高级' },
            ]}
            onChange={() => undefined}
          />
        }
        onClose={() => undefined}
      >
        <p>正文</p>
      </UiDialog>,
    );

    expect(markup).toContain('app-ui-dialog has-navigation');
    expect(markup).toContain('class="app-ui-dialog__navigation"');
    expect(markup.indexOf('app-ui-dialog__navigation')).toBeLessThan(
      markup.indexOf('app-ui-dialog__body'),
    );
    expect(
      markup.slice(
        markup.indexOf('app-ui-dialog__body'),
        markup.indexOf('正文'),
      ),
    ).not.toContain('设置分类');
  });

  it('locks image proportions and frame-specific content safe areas in CSS', () => {
    const css = readFileSync(new URL('./ui.css', import.meta.url), 'utf8');
    const square = css.match(/\.app-ui-dialog\s*\{([^}]*)\}/)?.[1];
    const landscape = css.match(/\.app-ui-dialog--compact\s*\{([^}]*)\}/)?.[1];

    expect(css).toMatch(/aspect-ratio:\s*1\s*\/\s*1\s*!important/);
    expect(css).toMatch(/aspect-ratio:\s*3\s*\/\s*2\s*!important/);
    expect(square).toContain('--app-ui-dialog-square-size: 56rem');
    expect(square).toContain('var(--app-ui-dialog-square-size)');
    expect(square).toContain('--app-ui-dialog-safe-inline: 6%');
    expect(square).toContain('--app-ui-dialog-safe-block: 6%');
    expect(landscape).toContain('--app-ui-dialog-safe-inline: 6%');
    expect(landscape).toContain('--app-ui-dialog-safe-block: 6%');
    expect(css).toMatch(
      /padding:\s*var\(--app-ui-dialog-safe-block\)\s*var\(--app-ui-dialog-safe-inline\)\s*!important/,
    );
    const header = css.match(/\.app-ui-dialog__header\s*\{([^}]*)\}/)?.[1];
    expect(header).toContain('padding: 0 0 12px');
    expect(header).not.toContain('clamp(');
    expect(css).toMatch(/center\s*\/\s*contain\s+no-repeat\s*!important/);
    expect(css).not.toContain('aspect-ratio: auto');
    expect(css).not.toContain('--app-ui-dialog-safe-inline: 6.6667%');
    expect(css).not.toContain('--app-ui-dialog-safe-block: 10%');
    expect(css).not.toMatch(/\.app-ui-dialog\.is-(?:manager|form|workspace)/);
  });

  it('uses one separator after the fixed header or fixed navigation', () => {
    const css = readFileSync(new URL('./ui.css', import.meta.url), 'utf8');
    const header = css.match(/\.app-ui-dialog__header\s*\{([^}]*)\}/)?.[1];
    const navigation = css.match(
      /\.app-ui-dialog__navigation\s*\{([^}]*)\}/,
    )?.[1];
    const headerWithNavigation = css.match(
      /\.app-ui-dialog\.has-navigation \.app-ui-dialog__header\s*\{([^}]*)\}/,
    )?.[1];

    expect(css).toMatch(
      /\.app-ui-dialog\.has-navigation \.app-ui-dialog__surface\s*\{[^}]*grid-template-rows:\s*auto auto minmax\(0,\s*1fr\) auto/,
    );
    expect(header).toContain('border-bottom: 1px solid var(--app-ui-rule)');
    expect(headerWithNavigation).toContain('border-bottom: 0');
    expect(navigation).toContain('border-bottom: 1px solid var(--app-ui-rule)');
    expect(navigation).not.toMatch(/overflow-y:\s*auto/);
  });

  it('uses the single dark frame set for both immutable ratios', () => {
    const css = readFileSync(new URL('./ui.css', import.meta.url), 'utf8');

    expect(css).toContain('dialog-frame.webp');
    expect(css).toContain('dialog-compact-frame.webp');
    expect(css).not.toContain('dialog-frame-dark.webp');
    expect(css).not.toContain('dialog-compact-frame-dark.webp');
    expect(css).not.toContain('[data-app-ui-theme="dark"]');
    expect(css).not.toContain('.app-ui-dialog.is-dark');
  });

  it('does not allow feature styles to override modal frame dimensions', () => {
    const sourceRoot = fileURLToPath(new URL('../../', import.meta.url));
    const offenders = cssFiles(sourceRoot)
      .filter((path) => !path.endsWith('/components/ui/ui.css'))
      .flatMap((path) => {
        const css = readFileSync(path, 'utf8');
        return /\.app-ui-dialog(?!__)[^{]*\{[^}]*(?:width|inline-size|max-width)\s*:/s.test(
          css,
        )
          ? [path]
          : [];
      });

    expect(offenders).toEqual([]);
  });

  it('has no public square modal variant API', () => {
    const source = readFileSync(new URL('./Ui.tsx', import.meta.url), 'utf8');

    expect(source).not.toContain('UiDialogVariant');
    expect(source).not.toMatch(/variant\??:\s*UiDialogVariant/);
    expect(source).toContain(
      'export function UiLayeredCompactDialog(props: UiLayeredDialogProps)',
    );
  });

  it('renders every public modal status tone', () => {
    for (const tone of UI_DIALOG_STATUS_TONES) {
      const markup = renderToStaticMarkup(
        <UiDialog
          ariaLabel={`${tone} 模态框`}
          title="设置"
          status={{ label: tone, tone }}
          onClose={() => undefined}
        >
          <p>内容</p>
        </UiDialog>,
      );

      expect(markup).toContain(`app-ui-dialog__status is-${tone}`);
    }
  });
});
