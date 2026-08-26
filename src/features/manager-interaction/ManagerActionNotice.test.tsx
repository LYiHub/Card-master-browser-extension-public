import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ManagerActionNotice } from './ManagerActionNotice';

describe('ManagerActionNotice', () => {
  it('renders disabled cards with a distinct inactive state', () => {
    const markup = renderToStaticMarkup(
      createElement(ManagerActionNotice, {
        notice: {
          title: '暗夜降临已停用',
          description: '拖至右上角的启用区域即可恢复页面光影。',
          tone: 'inactive',
        },
      }),
    );

    expect(markup).toContain('manager-action-notice is-inactive');
    expect(markup).toContain('manager-action-notice__status-icon');
    expect(markup).toContain('暗夜降临已停用');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('border-image-slice:12');
    expect(markup).not.toContain('border-image-slice:12 fill');
    expect(markup).toContain('background-clip:border-box');
    expect(markup).toContain('background-origin:border-box');
  });
});
