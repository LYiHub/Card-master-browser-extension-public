import type { BilibiliCapabilityCommand } from '../../bilibili-capabilities/domain/types';
import { bilibiliCapabilityDefinition } from '../../bilibili-capabilities/registry';
import type { MediaSpeedStandardSpeed } from '../../media-speed/domain/types';
import type { InstalledUserscript } from '../../userscript/domain/types';
import { sequencedActionColors } from '../manager-interaction/action-colors';
import {
  type DeckCard,
  isBilibiliCapabilityCard,
  isContentBlockingCard,
  isGamepadControlCard,
  isMediaResourcesCard,
  isMediaSpeedCard,
  isNewTabCard,
  isPageThemeCard,
} from './cards';

export type ManagerActionKind =
  | 'command'
  | 'toggle'
  | 'manage'
  | 'remove'
  | 'assistant'
  | 'library'
  | 'site-search'
  | 'open-new-tab'
  | 'block'
  | 'zap'
  | 'site-toggle'
  | 'undo-block'
  | 'theme-site-toggle'
  | 'theme-tune'
  | 'speed-select'
  | 'media-resources-collect'
  | 'capability-command'
  | 'cancel';

export type ManagerAction = {
  id: string;
  kind: ManagerActionKind;
  label: string;
  description?: string;
  accent?: string;
  target?: 'page-element';
  targetingMode?: 'single' | 'continuous';
  autoClose?: boolean;
  commandId?: string;
  speed?: MediaSpeedStandardSpeed;
  command?: BilibiliCapabilityCommand;
};

export const CANCEL_ACTION_ID = 'cancel';

export const CANCEL_ACTION: ManagerAction = {
  id: CANCEL_ACTION_ID,
  kind: 'cancel',
  label: '取消',
  description: '收束法印，返回牌阵',
  accent: '#bdd1d2',
};

export function actionPlacement(kind: ManagerActionKind) {
  return kind === 'remove' ||
    kind === 'manage' ||
    kind === 'toggle' ||
    kind === 'cancel'
    ? 'corner'
    : 'center';
}

export function cornerPositionForAction(kind: ManagerActionKind) {
  if (kind === 'remove') return 'bottom-left' as const;
  if (kind === 'manage') return 'bottom-right' as const;
  if (kind === 'toggle') return 'top-right' as const;
  if (kind === 'cancel') return 'top-left' as const;
  return null;
}

export function preferredActionId(actions: readonly ManagerAction[]) {
  return (
    actions.find((action) => actionPlacement(action.kind) === 'center')?.id ??
    actions.find((action) => action.kind === 'manage')?.id ??
    actions.find((action) => action.kind === 'toggle')?.id ??
    actions.find((action) => action.kind === 'remove')?.id ??
    null
  );
}

function colorizeCentralActions(actions: readonly ManagerAction[]) {
  const centralActions = actions.filter(
    (action) => actionPlacement(action.kind) === 'center',
  );
  const colors = sequencedActionColors(centralActions.length);
  const accents = new Map(
    centralActions.map((action, index) => [action.id, colors[index]]),
  );
  return actions.map((action) => {
    const accent = accents.get(action.id);
    return accent ? { ...action, accent } : action;
  });
}

function commandActions(item: InstalledUserscript): ManagerAction[] {
  if (!item.manager.enabled || !item.runtime.instanceId) return [];
  return item.runtime.commands.map((command) => ({
    id: `command:${command.id}`,
    commandId: command.id,
    kind: 'command',
    label: command.title,
    description: command.description,
    autoClose: command.autoClose,
  }));
}

export function actionsFor(card: DeckCard): ManagerAction[] {
  if (card.kind === 'steward') {
    return colorizeCentralActions([
      {
        id: 'script-workshop',
        kind: 'assistant',
        label: '脚本工坊',
        description: '理解当前页面，创建、解释、修复或维护脚本卡牌',
      },
      {
        id: 'library',
        kind: 'library',
        label: '牌库全览',
        description: '打开包含全部系统卡牌和已安装脚本的管理工作区',
      },
      {
        id: 'site-search',
        kind: 'site-search',
        label: '查找本站脚本',
        description: '前往 Greasy Fork 检索适用于当前站点的脚本',
      },
      {
        id: 'manage',
        kind: 'manage',
        label: '设置',
        description: '配置模型服务、脚本导入导出与后续全局选项',
      },
    ]);
  }
  if (isNewTabCard(card)) {
    return colorizeCentralActions([
      {
        id: 'open-new-tab',
        kind: 'open-new-tab',
        label: '打开新标签页',
        description: '新建并切换到卡牌大师新标签页',
      },
      {
        id: 'manage',
        kind: 'manage',
        label: '设置',
        description: '配置卡牌大师新标签页，或指定新标签页直接打开的网址',
      },
    ]);
  }
  if (isGamepadControlCard(card)) {
    return [
      {
        id: 'manage',
        kind: 'manage',
        label: '设置',
        description: '编辑完整按键映射、手感参数和全局控制状态',
      },
      {
        id: 'toggle',
        kind: 'toggle',
        label: card.enabled ? '停用' : '启用',
        description: card.enabled
          ? '停止所有网页和扩展界面的手柄控制'
          : '恢复所有网页和扩展界面的手柄控制',
      },
    ];
  }
  if (isContentBlockingCard(card)) {
    const controls: ManagerAction[] = card.snapshot.rulesEnabled
      ? [
          {
            id: 'block-element',
            kind: 'block',
            label: '永久拦截',
            description: '选择一个页面元素，生成并保存持久化过滤规则',
            target: 'page-element',
            targetingMode: 'continuous',
            autoClose: false,
          },
          {
            id: 'zap-element',
            kind: 'zap',
            label: '临时清除',
            description: '连续移除页面元素，本次刷新后自动恢复且不写入规则',
            target: 'page-element',
            targetingMode: 'continuous',
            autoClose: false,
          },
        ]
      : [];
    if (card.snapshot.rulesEnabled && card.site.hostname) {
      controls.push({
        id: 'site-toggle',
        kind: 'site-toggle',
        label: card.site.filteringEnabled ? '本站停用' : '本站启用',
        description: card.site.filteringEnabled
          ? `暂停 ${card.site.hostname} 的内容过滤`
          : `恢复 ${card.site.hostname} 的内容过滤`,
      });
    }
    controls.push({
      id: 'manage',
      kind: 'manage',
      label: '设置',
      description: '管理常规选项、过滤列表、自定义规则和完整配置',
    });
    const lastBatch = card.snapshot.lastElementBlockingBatch;
    if (lastBatch && lastBatch.hostname === card.site.hostname) {
      controls.push({
        id: 'undo-block',
        kind: 'undo-block',
        label: '恢复上次拦截',
        description: `恢复上次连续拦截的 ${lastBatch.rules.length} 项页面内容`,
      });
    }
    controls.push({
      id: 'toggle',
      kind: 'toggle',
      label: card.snapshot.rulesEnabled ? '停用' : '启用',
      description: card.snapshot.rulesEnabled
        ? '停用所有网站的内容过滤效果'
        : '恢复所有网站已载入的过滤规则',
    });
    return colorizeCentralActions(controls);
  }
  if (isPageThemeCard(card)) {
    const controls: ManagerAction[] = [
      {
        id: 'manage',
        kind: 'manage',
        label: '设置',
        description: '配置站点范围、自动切换与高级光影参数',
      },
      {
        id: 'toggle',
        kind: 'toggle',
        label: card.snapshot.enabled ? '停用' : '启用',
        description: card.snapshot.enabled
          ? '停止暗夜降临在所有站点继续生效'
          : '恢复暗夜降临并按站点配置生效',
      },
    ];
    if (
      !card.snapshot.enabled ||
      card.snapshot.status === 'error' ||
      card.snapshot.darkThemeDetected
    ) {
      return controls;
    }
    return colorizeCentralActions([
      {
        id: 'theme-site-toggle',
        kind: 'theme-site-toggle',
        label: card.snapshot.activeOnPage ? '本站停用' : '本站启用',
        description: card.snapshot.activeOnPage
          ? '立即在当前站点停用，保留暗夜降临的全局启用状态'
          : '立即恢复暗夜降临在当前站点的光影效果',
      },
      {
        id: 'theme-tune',
        kind: 'theme-tune',
        label: '调校光影',
        description: '调整当前站点的亮度、对比、色彩与字体表现',
      },
      ...controls,
    ]);
  }
  if (isMediaSpeedCard(card)) {
    const controls: ManagerAction[] = [
      {
        id: 'manage',
        kind: 'manage',
        label: '设置',
        description: '配置默认档位、音频媒体、速度法印与站点范围',
      },
      {
        id: 'toggle',
        kind: 'toggle',
        label: card.snapshot.enabled ? '停用' : '启用',
        description: card.snapshot.enabled
          ? '停用所有页面的媒体时间控制'
          : '恢复媒体时间控制并按站点配置生效',
      },
    ];
    if (!card.snapshot.enabled) return controls;
    return colorizeCentralActions([
      {
        id: 'speed-reset',
        kind: 'speed-select',
        speed: 1,
        label: '恢复 1×',
        description: '恢复当前页面所有可控媒体的正常速度',
      },
      ...controls,
    ]);
  }
  if (isMediaResourcesCard(card)) {
    const controls: ManagerAction[] = [
      {
        id: 'manage',
        kind: 'manage',
        label: '设置',
        description: '打开顺手牵羊原版设置页面',
      },
      {
        id: 'toggle',
        kind: 'toggle',
        label: card.snapshot.enabled ? '停用' : '启用',
        description: card.snapshot.enabled
          ? '停止所有页面的媒体资源发现'
          : '恢复所有页面的媒体资源发现',
      },
    ];
    if (!card.snapshot.enabled) return controls;
    return colorizeCentralActions([
      {
        id: 'collect-resources',
        kind: 'media-resources-collect',
        label: '顺手牵羊',
        description: '打开当前页面发现的媒体资源',
      },
      ...controls,
    ]);
  }
  if (isBilibiliCapabilityCard(card)) {
    const definition = bilibiliCapabilityDefinition(card.capabilityId);
    const commands: readonly {
      id: BilibiliCapabilityCommand;
      label: string;
      description: string;
    }[] =
      !card.snapshot.enabled ||
      (card.capabilityId === 'segment-skipping' && !card.snapshot.activeOnPage)
        ? []
        : card.capabilityId !== 'danmaku-compression'
          ? definition.commands
          : card.snapshot.temporaryMode === 'original-danmaku'
            ? [
                {
                  id: 'reload',
                  label: '恢复合成大弹幕',
                  description: '重新使用全局降噪配置处理当前视频弹幕',
                },
              ]
            : definition.commands;
    return colorizeCentralActions([
      ...commands.map((command) => ({
        id: `capability:${command.id}`,
        kind: 'capability-command' as const,
        label: command.label,
        description: command.description,
        command: command.id,
      })),
      {
        id: 'manage',
        kind: 'manage',
        label: '设置',
        description: '配置该扩展能力的完整参数与行为',
      },
      {
        id: 'toggle',
        kind: 'toggle',
        label: card.snapshot.enabled ? '停用' : '启用',
        description: card.snapshot.enabled
          ? '停用该扩展能力'
          : '恢复该扩展能力',
      },
    ]);
  }

  return colorizeCentralActions([
    {
      id: 'remove',
      kind: 'remove',
      label: '删除',
      description: '移除脚本源码、配置、GM 值和安装记录',
    },
    {
      id: 'manage',
      kind: 'manage',
      label: '设置',
      description: '配置源码、匹配范围、权限和更新选项',
    },
    ...commandActions(card),
    {
      id: 'toggle',
      kind: 'toggle',
      label: card.manager.enabled ? '停用' : '启用',
      description: card.manager.enabled
        ? '阻止脚本后续注入，当前页面通常需要刷新'
        : '恢复脚本在匹配页面中的后续注入',
    },
  ]);
}
