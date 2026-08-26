import { describe, expect, it, vi } from 'vitest';

import {
  findBilibiliRecommendationRefreshButton,
  isBilibiliHomepage,
  refreshBilibiliRecommendations,
} from './bilibili-recommendation-refresh';

function clickableElement() {
  return {
    click: vi.fn(),
    matches: vi.fn(() => false),
    querySelector: vi.fn(() => null),
  } as unknown as HTMLElement;
}

describe('B 站推荐即时刷新', () => {
  it('优先点击真正绑定刷新行为的 roll-btn，而不是外层容器', () => {
    const container = clickableElement();
    const button = clickableElement();
    const root = {
      querySelector: vi.fn((selector: string) =>
        selector === '.roll-btn' ? button : container,
      ),
    } as unknown as ParentNode;

    findBilibiliRecommendationRefreshButton(root)?.click();
    expect(button.click).toHaveBeenCalledOnce();
    expect(container.click).not.toHaveBeenCalled();
  });

  it('等待异步挂载的刷新按钮并只点击一次', async () => {
    const button = clickableElement();
    let scans = 0;
    const root = {
      querySelector: vi.fn((selector: string) => {
        if (selector !== '.roll-btn') return null;
        scans += 1;
        return scans >= 3 ? button : null;
      }),
    } as unknown as ParentNode;
    const wait = vi.fn(async () => undefined);

    await expect(
      refreshBilibiliRecommendations(root, {
        attempts: 4,
        intervalMs: 10,
        wait,
      }),
    ).resolves.toBe(true);
    expect(wait).toHaveBeenCalledTimes(2);
    expect(button.click).toHaveBeenCalledOnce();
  });

  it('只把 B 站主站根路径视为首页', () => {
    expect(
      isBilibiliHomepage({
        hostname: 'www.bilibili.com',
        pathname: '/',
      } as Location),
    ).toBe(true);
    expect(
      isBilibiliHomepage({
        hostname: 'www.bilibili.com',
        pathname: '/video/BV1',
      } as Location),
    ).toBe(false);
  });
});
