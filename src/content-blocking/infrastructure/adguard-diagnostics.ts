import { extensionErrorMessage } from '../../lib/extension-errors';
import type {
  ContentBlockingEngineReport,
  ContentBlockingState,
} from '../domain/types';

const USER_FILTER_ID = 0;
const ALLOWLIST_FILTER_ID = 100;
const BLOCKING_TRUSTED_FILTER_ID = -10;
const EMPTY_FILTER_DIAGNOSTIC =
  /^Cannot scan rules from filter (-?\d+):[\s\S]*Filter content is unavailable$/;

function diagnosticMessage(value: unknown) {
  return extensionErrorMessage(value);
}

export function normalizeAdguardDiagnostics(
  diagnostics: {
    staticErrors: readonly unknown[];
    dynamicErrors: readonly unknown[];
    conversionErrors?: readonly unknown[];
    limitations: readonly unknown[];
  },
  state: ContentBlockingState,
): Pick<ContentBlockingEngineReport, 'errors' | 'limitations'> {
  const expectedEmptyFilterIds = new Set<number>([BLOCKING_TRUSTED_FILTER_ID]);
  if (!state.userRules.trim()) expectedEmptyFilterIds.add(USER_FILTER_ID);
  if (state.allowlist.length === 0) {
    expectedEmptyFilterIds.add(ALLOWLIST_FILTER_ID);
  }

  return {
    errors: [
      ...diagnostics.staticErrors.map(diagnosticMessage),
      ...(diagnostics.conversionErrors ?? []).map(diagnosticMessage),
      ...diagnostics.dynamicErrors.map(diagnosticMessage).filter((message) => {
        const match = EMPTY_FILTER_DIAGNOSTIC.exec(message);
        return (
          !match || !expectedEmptyFilterIds.has(Number.parseInt(match[1], 10))
        );
      }),
    ],
    limitations: diagnostics.limitations.map(diagnosticMessage),
  };
}
