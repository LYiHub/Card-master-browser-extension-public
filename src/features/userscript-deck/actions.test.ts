import { describe, expect, it } from 'vitest';

import type {
  BilibiliCapabilityCard,
  BilibiliCapabilitySnapshot,
} from '../../bilibili-capabilities/domain/types';
import { startingContentBlockingSnapshot } from '../../content-blocking/domain/types';
import { startingMediaResourcesSnapshot } from '../../media-resources/domain/types';
import { startingMediaSpeedSnapshot } from '../../media-speed/domain/types';
import { startingPageThemeSnapshot } from '../../page-theme/domain/types';
import type { InstalledUserscript } from '../../userscript/domain/types';
import { INITIAL_USERSCRIPTS } from '../../userscript/fixtures';
import {
  actionPlacement,
  actionsFor,
  cornerPositionForAction,
  preferredActionId,
} from './actions';
import {
  contentBlockingCard,
  DECK_STEWARD_CARD,
  gamepadControlCard,
  mediaResourcesCard,
  mediaSpeedCard,
  NEW_TAB_CARD,
  pageThemeCard,
} from './cards';

function withCommands(
  script: InstalledUserscript,
  enabled = true,
): InstalledUserscript {
  return {
    ...script,
    manager: { ...script.manager, enabled },
    runtime: {
      ...script.runtime,
      instanceId: enabled ? 'instance-1' : null,
      status: enabled ? 'ready' : 'sleeping',
      commands: enabled
        ? [
            {
              id: 'stable',
              title: '真实命令',
              description: '来自当前脚本运行实例',
              autoClose: false,
              order: 0,
            },
          ]
        : [],
    },
  };
}

function danmakuCard(
  snapshot: Partial<BilibiliCapabilitySnapshot> = {},
): BilibiliCapabilityCard {
  return {
    kind: 'bilibili-capability',
    id: 'system-bilibili-danmaku-compression',
    capabilityId: 'danmaku-compression',
    title: '合成大弹幕',
    description: '合并重复弹幕。',
    snapshot: {
      id: 'danmaku-compression',
      revision: 1,
      status: 'ready',
      available: true,
      enabled: true,
      activeOnPage: true,
      currentHost: 'www.bilibili.com',
      temporaryMode: 'default',
      stateLabel: '已启用',
      metrics: [],
      ...snapshot,
    },
  };
}

describe('actionsFor', () => {
  it('maps the deck steward to the script workshop, library, site search, and settings', () => {
    expect(actionsFor(DECK_STEWARD_CARD)).toEqual([
      expect.objectContaining({
        id: 'script-workshop',
        kind: 'assistant',
        label: '脚本工坊',
      }),
      expect.objectContaining({ id: 'library', kind: 'library' }),
      expect.objectContaining({
        id: 'import-local-script',
        kind: 'library',
        label: '导入本地脚本',
      }),
      expect.objectContaining({
        id: 'site-search',
        kind: 'site-search',
        label: '查找本站脚本',
      }),
      expect.objectContaining({ id: 'manage', label: '设置' }),
    ]);
  });

  it('keeps gamepad settings and global enablement in fixed corners', () => {
    expect(
      actionsFor(gamepadControlCard()).map((action) => action.kind),
    ).toEqual(['manage', 'toggle']);
    expect(actionsFor(gamepadControlCard({ enabled: false }))[1]).toEqual(
      expect.objectContaining({ label: '启用' }),
    );
  });

  it('gives the new-tab system card one central open command and fixed settings', () => {
    expect(actionsFor(NEW_TAB_CARD)).toEqual([
      expect.objectContaining({
        id: 'open-new-tab',
        kind: 'open-new-tab',
        label: '打开新标签页',
      }),
      expect.objectContaining({
        id: 'manage',
        kind: 'manage',
        label: '设置',
      }),
    ]);
    expect(actionsFor(NEW_TAB_CARD)).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'toggle' }),
        expect.objectContaining({ kind: 'remove' }),
      ]),
    );
    expect(actionPlacement('open-new-tab')).toBe('center');
    expect(cornerPositionForAction('open-new-tab')).toBeNull();
  });

  it('keeps manager operations in fixed corners', () => {
    for (const script of INITIAL_USERSCRIPTS) {
      expect(actionsFor(script).map((action) => action.kind)).toEqual([
        'remove',
        'manage',
        'toggle',
      ]);
    }
  });

  it('exposes native blocking without inventing a Userscript command', () => {
    expect(
      actionsFor(
        contentBlockingCard(
          startingContentBlockingSnapshot(),
          'https://example.com/',
        ),
      ),
    ).toEqual([
      expect.objectContaining({
        id: 'block-element',
        kind: 'block',
        target: 'page-element',
        targetingMode: 'continuous',
      }),
      expect.objectContaining({
        id: 'zap-element',
        kind: 'zap',
        target: 'page-element',
        targetingMode: 'continuous',
      }),
      expect.objectContaining({
        id: 'site-toggle',
        kind: 'site-toggle',
        label: '本站停用',
      }),
      expect.objectContaining({ id: 'manage', kind: 'manage' }),
      expect.objectContaining({
        id: 'toggle',
        kind: 'toggle',
        label: '停用',
      }),
    ]);
  });

  it('keeps the global switch in the corner while content blocking is paused', () => {
    const actions = actionsFor(
      contentBlockingCard(
        {
          ...startingContentBlockingSnapshot(),
          rulesEnabled: false,
        },
        'https://example.com/',
      ),
    );

    expect(actions.map((action) => action.kind)).toEqual(['manage', 'toggle']);
    expect(actions.at(-1)).toEqual(
      expect.objectContaining({
        id: 'toggle',
        kind: 'toggle',
        label: '启用',
      }),
    );
  });

  it('offers grouped restore only on the batch hostname', () => {
    const snapshot = {
      ...startingContentBlockingSnapshot(),
      lastElementBlockingBatch: {
        sessionId: 'session-1',
        startedAt: 1,
        hostname: 'example.com',
        rules: ['example.com##.ad', 'example.com##.sponsor'],
      },
    };

    const matching = actionsFor(
      contentBlockingCard(snapshot, 'https://example.com/'),
    ).find((action) => action.kind === 'undo-block');
    expect(matching).toMatchObject({
      label: '恢复上次拦截',
      description: '恢复上次连续拦截的 2 项页面内容',
    });
    expect(
      actionsFor(contentBlockingCard(snapshot, 'https://example.org/')).map(
        (action) => action.kind,
      ),
    ).not.toContain('undo-block');
  });

  it('maps the page theme card to site, tuning, settings, and global state', () => {
    const card = pageThemeCard({
      ...startingPageThemeSnapshot('https://example.com/'),
      status: 'ready',
      enabled: true,
      activeOnPage: true,
    });
    expect(actionsFor(card)).toEqual([
      expect.objectContaining({
        id: 'theme-site-toggle',
        kind: 'theme-site-toggle',
      }),
      expect.objectContaining({ id: 'theme-tune', kind: 'theme-tune' }),
      expect.objectContaining({ id: 'manage', kind: 'manage' }),
      expect.objectContaining({ id: 'toggle', kind: 'toggle' }),
    ]);
    expect(
      actionsFor(card).find((action) => action.id === 'toggle')?.label,
    ).toBe('停用');
  });

  it('shows only global controls while 暗夜降临 is globally stopped', () => {
    const card = pageThemeCard({
      ...startingPageThemeSnapshot('https://example.com/'),
      status: 'ready',
      enabled: false,
      activeOnPage: false,
      inactiveReason: 'global-disabled',
    });

    expect(actionsFor(card).map((action) => action.kind)).toEqual([
      'manage',
      'toggle',
    ]);
    expect(
      actionsFor(card).find((action) => action.kind === 'toggle')?.label,
    ).toBe('启用');
  });

  it('maps the media speed card to page-level time controls', () => {
    const card = mediaSpeedCard({
      ...startingMediaSpeedSnapshot('https://example.com/'),
      status: 'ready',
      mediaCount: 1,
      videoCount: 1,
    });

    expect(actionsFor(card).map((action) => action.kind)).toEqual([
      'speed-select',
      'manage',
      'toggle',
    ]);
    expect(actionsFor(card)[0]).toEqual(
      expect.objectContaining({
        id: 'speed-reset',
        speed: 1,
        label: '恢复 1×',
      }),
    );
  });

  it('keeps only settings and enablement while media speed is stopped', () => {
    const card = mediaSpeedCard({
      ...startingMediaSpeedSnapshot('https://example.com/'),
      status: 'ready',
      enabled: false,
      activeOnPage: false,
    });

    expect(actionsFor(card).map((action) => action.kind)).toEqual([
      'manage',
      'toggle',
    ]);
  });

  it('keeps collection central and media resource management in fixed corners', () => {
    const card = mediaResourcesCard({
      ...startingMediaResourcesSnapshot('https://example.com/'),
      status: 'ready',
      enabled: true,
    });

    expect(actionsFor(card)).toEqual([
      expect.objectContaining({
        id: 'collect-resources',
        kind: 'media-resources-collect',
        label: '顺手牵羊',
      }),
      expect.objectContaining({
        id: 'manage',
        kind: 'manage',
        label: '设置',
      }),
      expect.objectContaining({
        id: 'toggle',
        kind: 'toggle',
        label: '停用',
      }),
    ]);
  });

  it('keeps only settings and enablement while media discovery is stopped', () => {
    const card = mediaResourcesCard({
      ...startingMediaResourcesSnapshot('https://example.com/'),
      status: 'ready',
      enabled: false,
      activeOnPage: false,
    });

    expect(actionsFor(card).map((action) => action.kind)).toEqual([
      'manage',
      'toggle',
    ]);
  });

  it('keeps global danmaku enablement in the corner and video actions in the center', () => {
    expect(actionsFor(danmakuCard())).toEqual([
      expect.objectContaining({
        id: 'capability:reload',
        kind: 'capability-command',
        label: '重新处理当前视频',
      }),
      expect.objectContaining({
        id: 'capability:restore',
        kind: 'capability-command',
        label: '暂用原弹幕',
      }),
      expect.objectContaining({ id: 'manage', kind: 'manage' }),
      expect.objectContaining({
        id: 'toggle',
        kind: 'toggle',
        label: '停用',
      }),
    ]);
  });

  it('offers only restoration while the current video temporarily uses original danmaku', () => {
    const actions = actionsFor(
      danmakuCard({
        activeOnPage: false,
        temporaryMode: 'original-danmaku',
        stateLabel: '本视频原弹幕',
      }),
    );

    expect(
      actions
        .filter((action) => action.kind === 'capability-command')
        .map((action) => ({ id: action.id, label: action.label })),
    ).toEqual([
      {
        id: 'capability:reload',
        label: '恢复合成大弹幕',
      },
    ]);
  });

  it('hides video-level danmaku actions while the capability is globally disabled', () => {
    const actions = actionsFor(
      danmakuCard({
        enabled: false,
        activeOnPage: false,
        stateLabel: '已停用',
      }),
    );

    expect(actions.map((action) => action.kind)).toEqual(['manage', 'toggle']);
    expect(actions.at(-1)).toEqual(
      expect.objectContaining({
        id: 'toggle',
        label: '启用',
      }),
    );
  });

  it('hides every Bilibili runtime command while its capability is disabled', () => {
    const card: BilibiliCapabilityCard = {
      ...danmakuCard(),
      id: 'system-bilibili-segment-skipping',
      capabilityId: 'segment-skipping',
      title: '绯红空降',
      snapshot: {
        ...danmakuCard().snapshot,
        id: 'segment-skipping',
        enabled: false,
        activeOnPage: false,
        stateLabel: '已停用',
      },
    };

    expect(actionsFor(card).map((action) => action.kind)).toEqual([
      'manage',
      'toggle',
    ]);
  });

  it('projects only live runtime commands into the center', () => {
    const actions = actionsFor(withCommands(INITIAL_USERSCRIPTS[0]));
    expect(actions).toContainEqual(
      expect.objectContaining({
        id: 'command:stable',
        commandId: 'stable',
        kind: 'command',
        label: '真实命令',
        description: '来自当前脚本运行实例',
        autoClose: false,
        accent: '#f0c66e',
      }),
    );
  });

  it('assigns stable non-repeating project colors to central actions', () => {
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      runtime: {
        ...INITIAL_USERSCRIPTS[0].runtime,
        instanceId: 'instance-1',
        status: 'ready' as const,
        commands: Array.from({ length: 128 }, (_, order) => ({
          id: `command-${order}`,
          title: `命令 ${order}`,
          autoClose: true,
          order,
        })),
      },
    };
    const first = actionsFor(script)
      .filter((action) => actionPlacement(action.kind) === 'center')
      .map((action) => action.accent);
    const second = actionsFor(script)
      .filter((action) => actionPlacement(action.kind) === 'center')
      .map((action) => action.accent);

    expect(first).toEqual(second);
    expect(new Set(first).size).toBe(first.length);
    expect(first.slice(0, 6)).toEqual([
      '#f0c66e',
      '#79cee0',
      '#8aaaf5',
      '#7bdaa0',
      '#f1b96f',
      '#ff8068',
    ]);
    expect(
      first.slice(6).every((color) => color?.startsWith('color-mix(in srgb,')),
    ).toBe(true);
  });

  it('withholds runtime commands while the script is disabled', () => {
    const actions = actionsFor(withCommands(INITIAL_USERSCRIPTS[0], false));
    expect(actions.some((action) => action.kind === 'command')).toBe(false);
    expect(preferredActionId(actions)).toBe('manage');
  });

  it('separates script commands from manager operations', () => {
    expect(actionPlacement('command')).toBe('center');
    expect(actionPlacement('assistant')).toBe('center');
    expect(actionPlacement('library')).toBe('center');
    expect(actionPlacement('site-search')).toBe('center');
    expect(actionPlacement('block')).toBe('center');
    expect(actionPlacement('site-toggle')).toBe('center');
    expect(actionPlacement('theme-site-toggle')).toBe('center');
    expect(actionPlacement('theme-tune')).toBe('center');
    expect(actionPlacement('speed-select')).toBe('center');
    expect(actionPlacement('media-resources-collect')).toBe('center');
    expect(actionPlacement('undo-block')).toBe('center');
    expect(actionPlacement('remove')).toBe('corner');
    expect(actionPlacement('manage')).toBe('corner');
    expect(actionPlacement('toggle')).toBe('corner');
    expect(actionPlacement('cancel')).toBe('corner');
  });

  it('assigns every shared operation to its stable corner', () => {
    expect(cornerPositionForAction('remove')).toBe('bottom-left');
    expect(cornerPositionForAction('manage')).toBe('bottom-right');
    expect(cornerPositionForAction('toggle')).toBe('top-right');
    expect(cornerPositionForAction('site-toggle')).toBeNull();
    expect(cornerPositionForAction('undo-block')).toBeNull();
    expect(cornerPositionForAction('media-resources-collect')).toBeNull();
    expect(cornerPositionForAction('cancel')).toBe('top-left');
    expect(cornerPositionForAction('command')).toBeNull();
    expect(cornerPositionForAction('block')).toBeNull();
  });
});
