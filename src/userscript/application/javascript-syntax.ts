import { parse } from 'acorn';
import { t } from '../../localization/messages';

import type { MetadataDiagnostic } from '../domain/types';

type ParserSyntaxError = SyntaxError & {
  loc?: {
    line: number;
    column: number;
  };
};

export function userscriptSyntaxDiagnostic(
  source: string,
): MetadataDiagnostic | null {
  try {
    parse(source, {
      ecmaVersion: 'latest',
      sourceType: 'script',
      allowReturnOutsideFunction: true,
    });
    return null;
  } catch (error) {
    const syntaxError = error as ParserSyntaxError;
    const message =
      syntaxError instanceof Error
        ? syntaxError.message.replace(/\s+\(\d+:\d+\)$/, '')
        : String(error);
    return {
      severity: 'error',
      code: 'invalid-userscript-syntax',
      message: t('cm_javascript_syntax_message_1', [String(message)]),
      line: syntaxError.loc?.line,
    };
  }
}
