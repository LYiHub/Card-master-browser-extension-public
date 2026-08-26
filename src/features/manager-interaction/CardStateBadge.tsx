export type CardStateTone = 'active' | 'inactive' | 'pending' | 'error';

export function CardStateBadge({
  label,
  tone,
}: {
  label: string;
  tone: CardStateTone;
}) {
  return (
    <div className={`manager-card__state is-${tone}`}>
      <i aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}
