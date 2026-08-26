import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { UserscriptSourcePanel } from './UserscriptSourcePanel';

describe('UserscriptSourcePanel', () => {
  it('places the fullscreen control over the code and hides other actions when expanded', () => {
    const markup = renderToStaticMarkup(
      <UserscriptSourcePanel
        source="// ==UserScript=="
        expandable
        expanded
        showHeading={false}
        onExpandedChange={() => undefined}
        onDownload={() => undefined}
        publicationUrl={null}
      />,
    );

    expect(markup).not.toContain('<strong>完整 `.user.js` 源码</strong>');
    expect(markup).toContain('userscript-source-panel__viewport');
    expect(markup).toContain(
      'userscript-source-panel is-expandable is-expanded',
    );
    expect(markup).toContain('aria-label="退出全屏源码查看（Esc）"');
    expect(markup).toContain('userscript-source-panel__expand');
    expect(markup.indexOf('userscript-source-panel__expand')).toBeGreaterThan(
      markup.indexOf('userscript-source-panel__viewport'),
    );
    expect(markup).toContain('<pre class="userscript-source-panel__source">');
    expect(markup).not.toContain('<textarea');

    const css = readFileSync(
      new URL('./userscript-source-panel.css', import.meta.url),
      'utf8',
    );
    expect(css).toContain('.userscript-source-panel.is-expanded');
    expect(css).toMatch(
      /\.userscript-source-panel\.is-expanded\s+\.userscript-source-panel__header\s*\{\s*display:\s*none;/,
    );
    expect(css).toMatch(
      /\.userscript-source-panel__expand\s*\{[^}]*position:\s*absolute;[^}]*top:\s*10px;[^}]*right:\s*18px;/s,
    );
    expect(css).not.toContain(':fullscreen');
  });
});
