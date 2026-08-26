import {
  matchPatternCompatibility,
  normalizeMatchPattern,
  validateIncludePattern,
  validateMatchPattern,
} from '../domain/matcher';
import type { InstalledUserscript, MetadataDiagnostic } from '../domain/types';
import { runtimeCompatibilityDiagnostics } from '../runtime/compatibility';
import { userscriptSyntaxDiagnostic } from './javascript-syntax';

function metadataLine(script: InstalledUserscript, key: string, value: string) {
  return script.metadata.entries.find(
    (entry) => entry.normalizedKey === key && entry.value === value,
  )?.line;
}

export function userscriptInstallationDiagnostics(script: InstalledUserscript) {
  const diagnostics: MetadataDiagnostic[] = [];
  for (const [key, patterns] of [
    ['match', script.metadata.matches],
    ['exclude-match', script.metadata.excludeMatches],
    ['include', script.metadata.includes],
    ['exclude', script.metadata.excludes],
  ] as const) {
    for (const pattern of patterns) {
      const normalizedPattern =
        key === 'match' || key === 'exclude-match'
          ? normalizeMatchPattern(pattern)
          : pattern;
      const message =
        key === 'match' || key === 'exclude-match'
          ? validateMatchPattern(pattern)
          : validateIncludePattern(pattern);
      const compatibility =
        key === 'match' || key === 'exclude-match'
          ? matchPatternCompatibility(pattern)
          : null;
      const line = metadataLine(script, key, pattern);
      if (normalizedPattern !== pattern) {
        diagnostics.push({
          severity: 'warning',
          code: 'normalized-match-pattern',
          message: `兼容的 @${key} 规则已规范为 ${normalizedPattern}。`,
          line,
        });
      }
      if (compatibility === 'legacy') {
        diagnostics.push({
          severity: 'warning',
          code: 'legacy-match-pattern',
          message: `非标准 @${key} 规则将使用兼容的用户脚本通配匹配。`,
          line,
        });
      } else if (message) {
        diagnostics.push({
          severity: 'error',
          code: 'invalid-match-pattern',
          message,
          line,
        });
      }
    }
  }
  for (const [kind, patterns] of [
    ['match', script.manager.userMatches],
    ['exclude-match', script.manager.userExcludeMatches],
  ] as const) {
    for (const pattern of patterns) {
      const message = validateMatchPattern(pattern);
      const compatibility = matchPatternCompatibility(pattern);
      if (compatibility === 'legacy') {
        diagnostics.push({
          severity: 'warning',
          code: 'legacy-manager-match-pattern',
          message: `${kind}：非标准规则将使用兼容的用户脚本通配匹配。`,
        });
      } else if (message) {
        diagnostics.push({
          severity: 'error',
          code: 'invalid-manager-match-pattern',
          message: `${kind}：${message}`,
        });
      }
    }
  }
  for (const [kind, patterns] of [
    ['include', script.manager.userIncludes],
    ['exclude', script.manager.userExcludes],
  ] as const) {
    for (const pattern of patterns) {
      const message = validateIncludePattern(pattern);
      if (!message) continue;
      diagnostics.push({
        severity: 'error',
        code: 'invalid-manager-include-pattern',
        message: `${kind}：${message}`,
      });
    }
  }
  const syntaxDiagnostic = userscriptSyntaxDiagnostic(script.source.code);
  if (syntaxDiagnostic) diagnostics.push(syntaxDiagnostic);
  return [...diagnostics, ...runtimeCompatibilityDiagnostics(script)];
}
