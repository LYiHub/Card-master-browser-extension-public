export type CastOperationTiming = 'after-charge' | 'during-charge';

type OperationResult =
  | { ok: true }
  | {
      ok: false;
      error: unknown;
    };

export async function runCastOperation(
  charge: () => Promise<void>,
  invoke: () => Promise<void>,
  timing: CastOperationTiming,
) {
  if (timing === 'after-charge') {
    await charge();
    await invoke();
    return;
  }

  const charging = charge();
  const operation = invoke().then(
    (): OperationResult => ({ ok: true }),
    (error: unknown): OperationResult => ({ ok: false, error }),
  );
  await charging;
  const result = await operation;
  if (!result.ok) throw result.error;
}
