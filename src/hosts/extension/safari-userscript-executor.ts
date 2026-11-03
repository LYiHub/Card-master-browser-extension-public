import { t } from '../../localization/messages';
import type { RegisteredUserScript } from './api';

type SafariScriptingApi = Pick<typeof chrome.scripting, 'executeScript'>;

type SafariExecutionTarget = Parameters<
  typeof chrome.scripting.executeScript
>[0]['target'];

export function executeSafariUserscriptSource(
  source: string,
  registrationId: string,
) {
  const filename = `userscript-${encodeURIComponent(registrationId)}.js`;
  const execute = new Function(`${source}\n//# sourceURL=${filename}`);
  return execute.call(globalThis);
}

export async function executeSafariUserscriptRegistration(
  scripting: SafariScriptingApi,
  target: SafariExecutionTarget,
  registration: RegisteredUserScript,
) {
  const world = registration.world === 'MAIN' ? 'MAIN' : 'ISOLATED';
  for (const source of registration.js ?? []) {
    const code = 'code' in source ? source.code : undefined;
    if (typeof code !== 'string') {
      throw new Error(
        t('cm_safari_userscript_executor_error_1', [String(registration.id)]),
      );
    }
    await scripting.executeScript({
      target,
      world,
      func: executeSafariUserscriptSource,
      args: [code, registration.id],
    });
  }
}
