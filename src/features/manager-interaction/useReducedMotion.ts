import { useEffect, useState } from 'react';

import {
  observeReducedMotion,
  prefersReducedMotion,
} from '../../motion/preference';

export function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);

  useEffect(() => observeReducedMotion(setReducedMotion), []);

  return reducedMotion;
}
