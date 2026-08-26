import { describe, expect, it } from 'vitest';

import { bilibiliSponsorPage } from './bilibili-sponsor-page';

describe('bilibiliSponsorPage', () => {
  it.each([
    'https://www.bilibili.com/video/BV1xx411c7mD/',
    'https://www.bilibili.com/bangumi/play/ss34412',
    'https://www.bilibili.com/list/watchlater',
    'https://www.bilibili.com/watchlater',
    'https://www.bilibili.com/medialist/play/ml1',
    'https://www.bilibili.com/blackboard/newplayer.html',
    'https://m.bilibili.com/video/BV1xx',
    'https://player.bilibili.com/player.html?bvid=BV1xx',
  ])('允许播放器页 %s', (url) => {
    expect(bilibiliSponsorPage(url)).toBe(true);
  });

  it.each([
    'https://space.bilibili.com/0/favlist?fid=0&ftype=create',
    'https://message.bilibili.com/#/whisper',
    'https://live.bilibili.com/123',
    'https://search.bilibili.com/all?keyword=test',
    'https://account.bilibili.com/account/home',
    'https://member.bilibili.com/platform/home',
    'https://passport.bilibili.com/login',
    'https://www.bilibili.com/',
    'http://www.bilibili.com/video/BV1xx',
    'https://www.youtube.com/watch?v=1',
  ])('拒绝非播放器页 %s', (url) => {
    expect(bilibiliSponsorPage(url)).toBe(false);
  });
});
