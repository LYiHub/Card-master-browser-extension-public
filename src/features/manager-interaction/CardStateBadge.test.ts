import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CardStateBadge } from './CardStateBadge';

describe('CardStateBadge', () => {
  it('渲染状态文案和对应色调类名', () => {
    const markup = renderToStaticMarkup(
      createElement(CardStateBadge, {
        label: '本站停用',
        tone: 'inactive',
      }),
    );

    expect(markup).toContain('manager-card__state is-inactive');
    expect(markup).toContain('<span>本站停用</span>');
    expect(markup).toContain('aria-hidden="true"');
  });
});
