import { isCardAccent } from '../../userscript/application/card-accent';
import {
  createUserscriptSource,
  replaceUserscriptSource,
  type UserscriptInstallation,
} from '../../userscript/application/install-service';
import {
  type InstalledUserscript,
  isUserscriptCoverImageDataUrl,
} from '../../userscript/domain/types';

export type AssistantSourceEdit = {
  oldText: string;
  newText: string;
};

export type AssistantScriptChange =
  | {
      operation: 'create';
      source: string;
      origin?: string;
    }
  | {
      operation: 'edit';
      targetScriptId: string;
      expectedRevision: string;
      edits: readonly AssistantSourceEdit[];
    }
  | {
      operation: 'delete';
      targetScriptId: string;
    }
  | {
      operation: 'set-enabled';
      targetScriptId: string;
      enabled: boolean;
    }
  | {
      operation: 'set-site-enabled';
      targetScriptId: string;
      sitePattern: string;
      enabled: boolean;
    }
  | {
      operation: 'set-cover-image';
      targetScriptId: string;
      expectedRevision: string;
      coverImage: string;
      coverAccent: string;
    };

export type AssistantScriptChangeApplication =
  | UserscriptInstallation
  | {
      mode: 'removed';
      scriptId: string;
    };

function installationOptions(source: string, origin?: string) {
  return {
    source,
    ...(origin ? { origin } : {}),
    createId: () => `ai-userscript-${crypto.randomUUID()}`,
    now: Date.now,
  };
}

export function applyAssistantSourceEdits(
  source: string,
  edits: readonly AssistantSourceEdit[],
) {
  if (edits.length === 0) {
    throw new Error('脚本修改必须至少包含一项编辑。');
  }
  let updated = source;
  edits.forEach((edit, index) => {
    const number = index + 1;
    if (!edit.oldText) {
      throw new Error(`第 ${number} 项脚本修改缺少旧文本。`);
    }
    if (edit.oldText === edit.newText) {
      throw new Error(`第 ${number} 项脚本修改没有产生变化。`);
    }
    if (edit.oldText === updated) {
      throw new Error(`第 ${number} 项脚本修改不能替换完整源码。`);
    }
    const start = updated.indexOf(edit.oldText);
    if (start < 0) {
      throw new Error(`第 ${number} 项脚本修改找不到指定的旧文本。`);
    }
    if (updated.indexOf(edit.oldText, start + 1) >= 0) {
      throw new Error(
        `第 ${number} 项脚本修改匹配到多处，请提供更多上下文使旧文本唯一。`,
      );
    }
    updated =
      updated.slice(0, start) +
      edit.newText +
      updated.slice(start + edit.oldText.length);
  });
  return updated;
}

export function applyAssistantScriptChange(
  current: readonly InstalledUserscript[],
  change: AssistantScriptChange,
): AssistantScriptChangeApplication {
  switch (change.operation) {
    case 'create': {
      return createUserscriptSource(
        current,
        installationOptions(change.source, change.origin),
      );
    }
    case 'edit': {
      const target = current.find(
        (script) => script.id === change.targetScriptId,
      );
      if (!target) {
        throw new Error(`找不到要修改的用户脚本：${change.targetScriptId}`);
      }
      return replaceUserscriptSource(
        current,
        change.targetScriptId,
        installationOptions(
          applyAssistantSourceEdits(target.source.code, change.edits),
        ),
      );
    }
    case 'delete': {
      if (!current.some((script) => script.id === change.targetScriptId)) {
        throw new Error(`找不到要删除的用户脚本：${change.targetScriptId}`);
      }
      return {
        mode: 'removed',
        scriptId: change.targetScriptId,
      };
    }
    case 'set-enabled': {
      const target = current.find(
        (script) => script.id === change.targetScriptId,
      );
      if (!target) {
        throw new Error(`找不到要设置的用户脚本：${change.targetScriptId}`);
      }
      const script = {
        ...target,
        manager: {
          ...target.manager,
          enabled: change.enabled,
        },
      };
      return {
        mode: 'replaced',
        script,
        scripts: current.map((candidate) =>
          candidate.id === script.id ? script : candidate,
        ),
        diagnostics: [],
      };
    }
    case 'set-site-enabled': {
      const target = current.find(
        (script) => script.id === change.targetScriptId,
      );
      if (!target) {
        throw new Error(`找不到要设置的用户脚本：${change.targetScriptId}`);
      }
      const withoutSite = target.manager.userExcludeMatches.filter(
        (pattern) => pattern !== change.sitePattern,
      );
      const userExcludeMatches = change.enabled
        ? withoutSite
        : [...withoutSite, change.sitePattern];
      const script = {
        ...target,
        manager: {
          ...target.manager,
          userExcludeMatches,
        },
      };
      return {
        mode: 'replaced',
        script,
        scripts: current.map((candidate) =>
          candidate.id === script.id ? script : candidate,
        ),
        diagnostics: [],
      };
    }
    case 'set-cover-image': {
      if (!isUserscriptCoverImageDataUrl(change.coverImage)) {
        throw new Error('卡牌封面必须是格式与体积有效的 WebP Data URL。');
      }
      if (!isCardAccent(change.coverAccent)) {
        throw new Error('卡牌边框颜色必须是有效的六位十六进制颜色。');
      }
      const target = current.find(
        (script) => script.id === change.targetScriptId,
      );
      if (!target) {
        throw new Error(`找不到要设置封面的用户脚本：${change.targetScriptId}`);
      }
      const script = {
        ...target,
        presentation: {
          accent: change.coverAccent,
          media: {
            kind: 'image' as const,
            image: change.coverImage,
          },
        },
      };
      return {
        mode: 'replaced',
        script,
        scripts: current.map((candidate) =>
          candidate.id === script.id ? script : candidate,
        ),
        diagnostics: [],
      };
    }
  }
}
