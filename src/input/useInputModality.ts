import { useEffect, useState } from 'react';

import { inputCoordinatorFor } from './coordinator';
import type { InputModality } from './intents';

export function useInputModality(root: Document | ShadowRoot) {
  const [modality, setModality] = useState<InputModality>(() =>
    inputCoordinatorFor(root).currentModality(),
  );

  useEffect(
    () => inputCoordinatorFor(root).subscribeModality(setModality),
    [root],
  );

  return modality;
}
