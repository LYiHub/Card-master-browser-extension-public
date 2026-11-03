import { extensionErrorMessage } from '../../lib/extension-errors';
import { t } from '../../localization/messages';

export function adguardEnginePhaseError(phase: string, error: unknown) {
  return new Error(
    t('cm_adguard_engine_error_error_1', [
      String(phase),
      String(extensionErrorMessage(error)),
    ]),
    {
      cause: error,
    },
  );
}

export async function runAdguardEnginePhase<T>(
  phase: string,
  operation: () => Promise<T>,
) {
  try {
    return await operation();
  } catch (error) {
    throw adguardEnginePhaseError(phase, error);
  }
}
