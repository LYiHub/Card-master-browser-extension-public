import { extensionErrorMessage } from '../../lib/extension-errors';

export function adguardEnginePhaseError(phase: string, error: unknown) {
  return new Error(`AdGuard ${phase}失败：${extensionErrorMessage(error)}`, {
    cause: error,
  });
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
