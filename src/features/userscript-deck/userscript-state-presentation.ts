import type { InstalledUserscript } from '../../userscript/domain/types';
import type { CardStateTone } from '../manager-interaction/CardStateBadge';

export type UserscriptStateNotice = {
  title: string;
  description: string;
  tone: 'neutral' | 'inactive' | 'error';
};

export type UserscriptStatePresentation = {
  badge: {
    label: string;
    tone: CardStateTone;
  };
  notice: UserscriptStateNotice;
};

export function userscriptStatePresentation(
  item: InstalledUserscript,
  executionUnavailable = false,
): UserscriptStatePresentation {
  if (item.manager.enabled && executionUnavailable) {
    return {
      badge: { label: '权限未开启', tone: 'error' },
      notice: {
        title: '需要开启“允许运行用户脚本”',
        description:
          '请在扩展详情页开启“允许运行用户脚本”，然后重新加载扩展。Chrome 默认关闭这项开关。',
        tone: 'error',
      },
    };
  }
  if (!item.manager.enabled) {
    return item.runtime.pendingRefresh
      ? {
          badge: { label: '停用待刷新', tone: 'pending' },
          notice: {
            title: '脚本停用等待刷新',
            description: '当前页面仍保留旧实例，刷新后将完成停用。',
            tone: 'inactive',
          },
        }
      : {
          badge: { label: '已停用', tone: 'inactive' },
          notice: {
            title: '脚本当前已停用',
            description: '拖至右上角的启用区域即可恢复运行。',
            tone: 'inactive',
          },
        };
  }
  if (item.runtime.pendingRefresh) {
    if (!item.runtime.instanceId) {
      return {
        badge: { label: '待刷新', tone: 'pending' },
        notice: {
          title: '刷新页面以启用脚本',
          description: '脚本已成功导入。刷新当前页面后，它会自动开始运行。',
          tone: 'neutral',
        },
      };
    }
    return {
      badge: { label: '更新待刷新', tone: 'pending' },
      notice: {
        title: '脚本更新等待刷新',
        description: '当前页面仍在运行旧实例，刷新后将载入最新脚本。',
        tone: 'neutral',
      },
    };
  }
  if (item.runtime.status === 'error') {
    return {
      badge: { label: '执行异常', tone: 'error' },
      notice: {
        title: '脚本执行异常',
        description:
          item.runtime.error ?? '脚本运行失败，但运行时没有返回错误详情。',
        tone: 'error',
      },
    };
  }
  if (item.runtime.status === 'not-matched') {
    return {
      badge: { label: '本站不生效', tone: 'inactive' },
      notice: {
        title: '脚本在本站未激活',
        description: '当前页面不符合脚本的匹配规则。',
        tone: 'neutral',
      },
    };
  }
  if (item.runtime.status === 'running') {
    return {
      badge: { label: '正在连接', tone: 'pending' },
      notice: {
        title: '脚本正在连接',
        description: '页面运行时正在建立脚本实例。',
        tone: 'neutral',
      },
    };
  }
  if (item.runtime.status === 'ready' && item.runtime.instanceId) {
    return {
      badge: { label: '已唤醒', tone: 'active' },
      notice: {
        title: '脚本已正常加载',
        description: '此脚本没有注册页面指令。',
        tone: 'neutral',
      },
    };
  }
  return {
    badge: { label: '待刷新', tone: 'pending' },
    notice: {
      title: '刷新页面以启用脚本',
      description: '脚本已成功导入。刷新当前页面后，它会自动开始运行。',
      tone: 'neutral',
    },
  };
}
