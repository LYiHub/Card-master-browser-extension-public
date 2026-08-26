import {
  AudioShortcutControl,
  ContextPlaque,
  type ContextPlaqueContent,
} from '../../components/ui/ContextPlaque';
import { projectAssetUrl } from '../../lib/project-assets';
import type { ManagerMode } from '../manager-interaction/state';

export type CardContextPromptContent = ContextPlaqueContent;

export function CardContextPrompt({
  info,
  mode,
  preview,
  importPresentation = false,
  audioMuted,
  onToggleAudio,
}: {
  info: CardContextPromptContent;
  mode: ManagerMode;
  preview: boolean;
  importPresentation?: boolean;
  audioMuted: boolean;
  onToggleAudio: () => void;
}) {
  return (
    <ContextPlaque
      content={info}
      className={`is-${mode}${preview ? ' is-hover-preview' : ''}${importPresentation ? ' is-import-presentation' : ''}`}
      transition={
        mode === 'collecting'
          ? 'suspended'
          : mode === 'closed'
            ? 'immediate'
            : 'animated'
      }
      bottomOrnamentUrl={projectAssetUrl(
        'userscript-deck/visual/ui/interface/surfaces/plaque-bottom.webp',
      )}
      topOrnamentUrl={projectAssetUrl(
        'userscript-deck/visual/ui/interface/surfaces/plaque-top.webp',
      )}
      shortcutAction={
        <AudioShortcutControl
          muted={audioMuted}
          mutedIconUrl={projectAssetUrl(
            'userscript-deck/visual/ui/interface/icons/sound-off.webp',
          )}
          activeIconUrl={projectAssetUrl(
            'userscript-deck/visual/ui/interface/icons/sound-on.webp',
          )}
          onToggle={onToggleAudio}
        />
      }
    />
  );
}
