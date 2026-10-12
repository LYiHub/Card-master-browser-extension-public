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

export const RULE_QUOTA_DIAGNOSTIC =
  /(?:Cannot change list of enabled rule\s*sets|exceeds the rule count limit|rule limit was exceeded|rule count limit)/i;

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

  const rawStaticErrors = diagnostics.staticErrors.map(diagnosticMessage);
  const staticQuotaLimitations: string[] = [];
  const staticErrors: string[] = [];
  for (const message of rawStaticErrors) {
    if (RULE_QUOTA_DIAGNOSTIC.test(message)) {
      staticQuotaLimitations.push(message);
    } else {
      staticErrors.push(message);
    }
  }

  return {
    errors: [
      ...staticErrors,
      ...(diagnostics.conversionErrors ?? []).map(diagnosticMessage),
      ...diagnostics.dynamicErrors.map(diagnosticMessage).filter((message) => {
        const match = EMPTY_FILTER_DIAGNOSTIC.exec(message);
        return (
          !match || !expectedEmptyFilterIds.has(Number.parseInt(match[1], 10))
        );
      }),
    ],
    limitations: [
      ...staticQuotaLimitations,
      ...diagnostics.limitations.map(diagnosticMessage),
    ],
  };
}
