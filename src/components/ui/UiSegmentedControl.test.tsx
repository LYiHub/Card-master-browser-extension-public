import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { UiSegmentedControl } from './Ui';

describe('UiSegmentedControl', () => {
  it('exposes one horizontal radio-group contract', () => {
    const markup = renderToStaticMarkup(
      <UiSegmentedControl
        label="牌库筛选"
        value="all"
        options={[
          { value: 'all', label: '全部' },
          { value: 'enabled', label: '已启用' },
          { value: 'disabled', label: '已停用' },
        ]}
        contextNavigation
        onChange={() => undefined}
      />,
    );

    expect(markup).toContain('<fieldset');
    expect(markup).toContain('type="radio"');
    expect(markup).toContain('checked=""');
    expect(markup).toContain('data-app-ui-choice-group="true"');
    expect(markup).toContain('data-app-ui-context-navigation="true"');
    expect(markup).not.toContain('role="tab"');
  });

  it('uses the flush shared frame without a nested inset', () => {
    const css = readFileSync(new URL('./ui.css', import.meta.url), 'utf8');

    expect(css).toMatch(
      /\.app-ui-segmented-control\s*\{\s*display:[\s\S]*?padding:\s*0;/,
    );
    expect(css).not.toContain('.app-ui-tabs');
  });
});
