import { projectAssetUrl } from '../../lib/project-assets';

const CARD_MASTER_LOGO_URL = projectAssetUrl(
  'userscript-deck/visual/action-icons/card-master-logo.png',
);

export function DeckEntryLogo({ className }: { className?: string }) {
  return (
    <img
      className={className}
      src={CARD_MASTER_LOGO_URL}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
