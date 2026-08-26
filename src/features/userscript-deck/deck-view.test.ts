import { describe, expect, it } from 'vitest';

import { startingContentBlockingSnapshot } from '../../content-blocking/domain/types';
import { INITIAL_USERSCRIPTS } from '../../userscript/fixtures';
import { contentBlockingCard } from './cards';
import {
  activeDeckCardCount,
  userscriptsForPage,
  visibleDeckCardCount,
} from './deck-card-activity';
import { userscriptDeckContextPrompt } from './deck-view';
import { deckMotionCardCount } from './useDeckLifecycleController';

describe('Userscript deck card focus copy', () => {
  it('keeps disabled userscripts visible when they match the current page', () => {
    const matching = INITIAL_USERSCRIPTS[0];
    const disabled = {
      ...INITIAL_USERSCRIPTS[1],
      manager: {
        ...INITIAL_USERSCRIPTS[1].manager,
        enabled: false,
      },
    };

    expect(
      userscriptsForPage([matching, disabled], {
        url: 'http://127.0.0.1:5173/example',
        frameId: 0,
        topFrame: true,
      }).map((script) => script.id),
    ).toEqual([matching.id, disabled.id]);
  });

  it('keeps disabled system cards visible in the page count', () => {
    const runtimeContext = {
      url: 'https://example.com/',
      frameId: 0,
      topFrame: true,
    };

    expect(
      visibleDeckCardCount({
        scripts: [],
        runtimeContext,
      }),
    ).toBe(6);
  });

  it('counts active cards separately from visible cards', () => {
    const enabled = INITIAL_USERSCRIPTS[0];
    const disabled = {
      ...INITIAL_USERSCRIPTS[1],
      manager: {
        ...INITIAL_USERSCRIPTS[1].manager,
        enabled: false,
      },
    };

    expect(
      activeDeckCardCount({
        scripts: [enabled, disabled],
        runtimeContext: {
          url: 'http://127.0.0.1:5173/example',
          frameId: 0,
          topFrame: true,
        },
        contentBlockingActive: true,
        pageThemeActive: false,
        gamepadControlActive: true,
      }),
    ).toBe(5);
  });

  it('keeps the collection layout on its captured visible card count', () => {
    expect(deckMotionCardCount('collecting', 3, 5)).toBe(5);
    expect(deckMotionCardCount('closed', 3, 5)).toBe(3);
  });

  it('projects installed script name and description with concise metadata', () => {
    const script = INITIAL_USERSCRIPTS[0];

    const contextPrompt = userscriptDeckContextPrompt({
      libraryError: null,
      interactionError: null,
      mode: 'spread',
      selected: script,
      focusedItem: null,
      executionCapability: { status: 'available' },
      inputModality: 'keyboard',
    });

    expect(contextPrompt).toMatchObject({
      title: script.metadata.name,
      description: script.metadata.description,
      stats: [
        `v${script.metadata.version}`,
        script.metadata.author || '作者未声明',
      ],
    });
  });

  it('suppresses input hints while a selected card is returning', () => {
    const script = INITIAL_USERSCRIPTS[0];
    const contextPrompt = userscriptDeckContextPrompt({
      libraryError: null,
      interactionError: null,
      mode: 'returning',
      selected: script,
      focusedItem: null,
      executionCapability: { status: 'available' },
      inputModality: 'keyboard',
    });

    expect(contextPrompt.shortcuts).toEqual([]);
  });

  it('does not present native engine counters as system-card metadata', () => {
    const card = contentBlockingCard(
      {
        ...startingContentBlockingSnapshot(),
        activeRuleCount: 133_592,
        subscriptionCount: 3,
      },
      'https://example.com/',
    );

    const contextPrompt = userscriptDeckContextPrompt({
      libraryError: null,
      interactionError: null,
      mode: 'spread',
      selected: card,
      focusedItem: null,
      executionCapability: { status: 'available' },
      inputModality: 'keyboard',
    });

    expect(contextPrompt).toMatchObject({
      title: '杀',
      description: card.description,
      stats: [],
    });
    expect(
      userscriptDeckContextPrompt({
        libraryError: null,
        interactionError: null,
        mode: 'spread',
        selected: contentBlockingCard(
          {
            ...card.snapshot,
            activeRuleCount: 1,
            subscriptionCount: 0,
          },
          'https://example.com/',
        ),
        focusedItem: null,
        executionCapability: { status: 'available' },
        inputModality: 'keyboard',
      }).key,
    ).toBe(contextPrompt.key);
  });

  it('keeps the normal card metadata in the center plaque after a runtime error', () => {
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      runtime: {
        ...INITIAL_USERSCRIPTS[0].runtime,
        status: 'error' as const,
        error:
          'ReferenceError: missingValue is not defined\n    at script.js:42',
      },
    };

    expect(
      userscriptDeckContextPrompt({
        libraryError: null,
        interactionError: null,
        mode: 'spread',
        selected: script,
        focusedItem: null,
        executionCapability: { status: 'available' },
        inputModality: 'keyboard',
      }),
    ).toMatchObject({
      title: script.metadata.name,
      description: script.metadata.description,
      stats: [`v${script.metadata.version}`, script.metadata.author],
    });
  });

  it('marks interaction failures as assertive error content', () => {
    expect(
      userscriptDeckContextPrompt({
        libraryError: null,
        interactionError: '规则未能应用',
        mode: 'spread',
        selected: null,
        focusedItem: null,
        executionCapability: { status: 'available' },
        inputModality: 'keyboard',
      }),
    ).toMatchObject({
      key: 'interaction-error',
      title: '当前操作未能完成',
      description: '规则未能应用',
      tone: 'error',
    });
  });

  it('identifies browser storage exhaustion instead of blaming the deck', () => {
    expect(
      userscriptDeckContextPrompt({
        libraryError:
          'IO error: .../005016.ldb: FILE_ERROR_NO_SPACE (WritableFileAppend)',
        interactionError: null,
        mode: 'spread',
        selected: null,
        focusedItem: null,
        executionCapability: { status: 'available' },
        inputModality: 'keyboard',
      }),
    ).toMatchObject({
      key: 'extension-storage-space-error',
      title: '扩展本地存储写入失败',
      tone: 'error',
    });
  });

  it('describes pointer hover as inspecting rather than selecting a card', () => {
    expect(
      userscriptDeckContextPrompt({
        libraryError: null,
        interactionError: null,
        mode: 'spread',
        selected: null,
        focusedItem: null,
        executionCapability: { status: 'available' },
        inputModality: 'pointer',
      }).shortcuts,
    ).toContainEqual({ key: '悬浮', label: '查看卡牌' });
  });
});
