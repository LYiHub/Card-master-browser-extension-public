import { classNames } from '../../lib/class-names';

export const MANAGER_CARD_GLOW_LAYER_SELECTOR =
  '.manager-card__charge-aura, .manager-card__charge-ring, .manager-card__charge-rays, .manager-card__charge-flash';

export function ManagerCardGlowEffect({
  active = false,
  className,
}: {
  active?: boolean;
  className?: string;
}) {
  return (
    <span
      className={classNames(
        'manager-card-glow-effect',
        active && 'is-active',
        className,
      )}
      aria-hidden="true"
    >
      <span className="manager-card__charge-aura" aria-hidden="true" />
      <span className="manager-card__charge-ring" aria-hidden="true" />
      <span className="manager-card__charge-rays" aria-hidden="true" />
      <span className="manager-card__charge-flash" aria-hidden="true" />
    </span>
  );
}
