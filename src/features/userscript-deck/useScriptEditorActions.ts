import { userscriptIdentityConflict } from '../../userscript/application/install-service';
import { updateUserscriptEditableMetadata } from '../../userscript/application/metadata-editor';
import { userscriptInstallationDiagnostics } from '../../userscript/application/preflight';
import { validateMatchPattern } from '../../userscript/domain/matcher';
import {
  formatMetadataDiagnostic,
  parseUserscriptMetadata,
  userscriptDisplayName,
} from '../../userscript/domain/metadata';
import {
  type InstalledUserscript,
  isUserscriptPresentation,
} from '../../userscript/domain/types';
import { type DeckCard, isInstalledUserscript } from './cards';
import type { UserscriptDeckHost } from './host';
import type { ManageScriptDraft } from './ManageBoard';

export function useScriptEditorActions({
  host,
  items,
  selected,
  commitScript,
}: {
  host: Pick<UserscriptDeckHost, 'runtime' | 'runtimeContext'>;
  items: readonly InstalledUserscript[];
  selected: DeckCard | null;
  commitScript: (script: InstalledUserscript) => void;
}) {
  const { runtime, runtimeContext } = host;

  const saveManagement = (draft: ManageScriptDraft) => {
    try {
      if (!selected || !isInstalledUserscript(selected)) {
        return '当前卡牌不是可管理的用户脚本。';
      }
      const source = updateUserscriptEditableMetadata(draft.source, {
        name: draft.name,
        description: draft.description,
      });
      const parsed = parseUserscriptMetadata(source);
      if (!parsed.metadata) {
        return parsed.diagnostics.map((entry) => entry.message).join(' ');
      }
      const duplicate = userscriptIdentityConflict(
        items,
        parsed.metadata,
        selected.id,
      );
      if (duplicate) {
        return `脚本身份与已安装的“${userscriptDisplayName(duplicate.metadata)}”重复。`;
      }
      for (const [kind, pattern] of [
        ...draft.userMatches.map((value) => ['@match', value] as const),
        ...draft.userExcludeMatches.map(
          (value) => ['@exclude-match', value] as const,
        ),
      ]) {
        const error = validateMatchPattern(pattern);
        if (error) return `${kind} ${pattern}: ${error}`;
      }
      if (
        draft.coverPresentation !== null &&
        !isUserscriptPresentation(draft.coverPresentation)
      ) {
        return '脚本封面或边框颜色无效。';
      }
      const updated = {
        ...selected,
        source: {
          ...selected.source,
          code: source,
          updatedAt: Date.now(),
        },
        presentation: draft.coverPresentation ?? selected.presentation,
        metadata: parsed.metadata,
        manager: {
          ...selected.manager,
          checkForUpdates: draft.checkForUpdates,
          userMatches: draft.userMatches,
          userIncludes: draft.userIncludes,
          userExcludeMatches: draft.userExcludeMatches,
          userExcludes: draft.userExcludes,
        },
      };
      const preflight = userscriptInstallationDiagnostics(updated).filter(
        (diagnostic) => diagnostic.severity === 'error',
      );
      if (preflight.length > 0) {
        return preflight.map(formatMetadataDiagnostic).join(' ');
      }
      commitScript({
        ...updated,
        runtime: runtime.synchronizeState(updated, runtimeContext),
      });
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  };

  return { saveManagement };
}
