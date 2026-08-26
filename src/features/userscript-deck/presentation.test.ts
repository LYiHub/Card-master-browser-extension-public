import { describe, expect, it } from 'vitest';

import {
  BILIBILI_CAPABILITY_IDS,
  type BilibiliCapabilitySnapshot,
} from '../../bilibili-capabilities/domain/types';
import { startingContentBlockingSnapshot } from '../../content-blocking/domain/types';
import {
  preinstalledCardMedia,
  presetCardMedia,
  userscriptCardMedia,
} from '../../lib/userscript-deck-media';
import { startingMediaResourcesSnapshot } from '../../media-resources/domain/types';
import { startingMediaSpeedSnapshot } from '../../media-speed/domain/types';
import { startingPageThemeSnapshot } from '../../page-theme/domain/types';
import { INITIAL_USERSCRIPTS } from '../../userscript/fixtures';
import {
  bilibiliIntegrationCards,
  contentBlockingCard,
  DECK_STEWARD_CARD,
  gamepadControlCard,
  mediaResourcesCard,
  mediaSpeedCard,
  NEW_TAB_CARD,
  pageThemeCard,
} from './cards';
import { cardAccent, cardMedia } from './presentation';

function readyBilibiliSnapshots(): BilibiliCapabilitySnapshot[] {
  return BILIBILI_CAPABILITY_IDS.map((id) => ({
    id,
    revision: 0,
    status: 'ready',
    available: true,
    enabled: true,
    activeOnPage: true,
    currentHost: 'www.bilibili.com',
    temporaryMode: 'default',
    stateLabel: '已启用',
    metrics: [],
  }));
}

describe('deck card presentation projection', () => {
  it('maps all nine preset cards to their dedicated named media', () => {
    const cards = [
      contentBlockingCard(startingContentBlockingSnapshot(), null),
      pageThemeCard(startingPageThemeSnapshot()),
      mediaSpeedCard(startingMediaSpeedSnapshot()),
      DECK_STEWARD_CARD,
      ...bilibiliIntegrationCards(readyBilibiliSnapshots()),
      gamepadControlCard(),
      mediaResourcesCard(startingMediaResourcesSnapshot()),
    ];
    const expectedVariants = [
      '01-content-blocking',
      '02-page-theme',
      '03-media-speed',
      '04-deck-steward',
      '05-bilibili-recommendation',
      '06-bilibili-danmaku',
      '07-bilibili-segments',
      '08-gamepad-control',
      '09-media-resources',
    ] as const;

    expect(cards.map((card) => cardMedia(card))).toEqual(
      expectedVariants.map((variant) =>
        variant === '08-gamepad-control'
          ? {
              kind: 'image',
              imageUrl: expect.stringContaining(
                `/userscript-deck/card-art/preset-cards/${variant}.webp`,
              ),
            }
          : {
              kind: 'video',
              videoUrl: expect.stringContaining(
                `/userscript-deck/video/preset-cards/${variant}.mp4`,
              ),
              posterImageUrl: expect.stringContaining(
                `/userscript-deck/card-art/preset-cards/${variant}.webp`,
              ),
            },
      ),
    );
    expect(cards.map(cardAccent)).toEqual(
      expectedVariants.map((variant) => presetCardMedia(variant).accent),
    );
    expect(cardMedia(INITIAL_USERSCRIPTS[0])).toMatchObject({
      kind: 'video',
      videoUrl: expect.stringContaining(
        '/userscript-deck/video/userscript-cards/01.mp4',
      ),
    });
    expect(cardAccent(INITIAL_USERSCRIPTS[0])).toBe(
      userscriptCardMedia('01').accent,
    );
    expect(cardMedia(NEW_TAB_CARD)).toEqual({
      kind: 'image',
      imageUrl: expect.stringContaining(
        '/userscript-deck/card-art/system-cards/new-tab.webp',
      ),
    });
  });

  it('resolves dedicated preinstalled-script media', () => {
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      id: 'preinstalled-bilikit-core',
      presentation: {
        accent: '#ffffff',
        media: {
          kind: 'video' as const,
          video: 'userscript-deck/video/preinstalled-cards/01-bilikit-core.mp4',
        },
      },
    };

    expect(cardMedia(script)).toMatchObject({
      kind: 'video',
      videoUrl: expect.stringContaining(
        '/userscript-deck/video/preinstalled-cards/01-bilikit-core.mp4',
      ),
      posterImageUrl: expect.stringContaining(
        '/userscript-deck/card-art/preinstalled-cards/01-bilikit-core.webp',
      ),
    });
    expect(cardAccent(script)).toBe(
      preinstalledCardMedia('01-bilikit-core').accent,
    );
  });

  it('resolves a bundled preinstalled still cover', () => {
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      id: 'preinstalled-copying-lifted',
      presentation: {
        accent: '#ffffff',
        media: {
          kind: 'image' as const,
          image:
            'userscript-deck/card-art/preinstalled-cards/04-copying-lifted.webp',
        },
      },
    };

    expect(cardMedia(script)).toMatchObject({
      kind: 'image',
      imageUrl: expect.stringContaining(
        '/userscript-deck/card-art/preinstalled-cards/04-copying-lifted.webp',
      ),
    });
  });

  it('uses a persisted allocated material and falls back for unknown media', () => {
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      id: 'local-userscript-new',
      presentation: {
        accent: '#ffffff',
        media: {
          kind: 'video' as const,
          video: 'userscript-deck/video/userscript-cards/02.mp4',
        },
      },
    };
    expect(cardMedia(script)).toMatchObject({
      kind: 'video',
      videoUrl: expect.stringContaining(
        '/userscript-deck/video/userscript-cards/02.mp4',
      ),
      posterImageUrl: expect.stringContaining(
        '/userscript-deck/card-art/userscript-cards/02.webp',
      ),
    });
    expect(cardAccent(script)).toBe(userscriptCardMedia('02').accent);

    const uploadedVideo = 'data:video/mp4;base64,dmlkZW8=';
    const uploadedPoster = 'data:image/webp;base64,Y292ZXI=';
    expect(
      cardMedia({
        ...script,
        presentation: {
          ...script.presentation,
          media: {
            kind: 'video' as const,
            video: uploadedVideo,
            poster: uploadedPoster,
          },
        },
      }),
    ).toEqual({
      kind: 'video',
      videoUrl: uploadedVideo,
      posterImageUrl: uploadedPoster,
    });
    expect(
      cardAccent({
        ...script,
        presentation: {
          accent: '#72aabb',
          media: {
            kind: 'image' as const,
            image: uploadedPoster,
          },
        },
      }),
    ).toBe('#72aabb');

    const unknown = {
      ...script,
      presentation: {
        ...script.presentation,
        media: { kind: 'video' as const, video: 'unknown.mp4' },
      },
    };
    expect(cardMedia(unknown)).toMatchObject({
      kind: 'video',
      videoUrl: expect.stringContaining(
        '/userscript-deck/video/userscript-cards/01.mp4',
      ),
      posterImageUrl: expect.stringContaining(
        '/userscript-deck/card-art/userscript-cards/01.webp',
      ),
    });
  });
});
