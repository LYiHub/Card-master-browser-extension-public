import type { ReactNode } from 'react';

import { classNames } from '../../lib/class-names';

export function MotionIconSwap<State extends string>({
  state,
  items,
  className,
}: {
  state: State;
  items: readonly { state: State; icon: ReactNode }[];
  className?: string;
}) {
  return (
    <span
      className={classNames('app-motion-icon-swap', className)}
      aria-hidden="true"
    >
      {items.map((item) => (
        <span
          key={item.state}
          className={classNames(
            'app-motion-icon-swap__item',
            item.state === state && 'is-active',
          )}
        >
          {item.icon}
        </span>
      ))}
    </span>
  );
}
