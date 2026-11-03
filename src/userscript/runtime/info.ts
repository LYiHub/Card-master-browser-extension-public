import { t } from '../../localization/messages';
import type { UserscriptResourceBundle } from '../application/resource-loader';
import type { InstalledUserscript } from '../domain/types';

export function userscriptInfo(
  script: InstalledUserscript,
  bundle: UserscriptResourceBundle,
  frameId?: number,
) {
  return {
    scriptHandler: t('cm_info_script_handler_1'),
    version: '0.3.2',
    handlerVersion: '0.3.2',
    injectInto: script.metadata.grants.includes('none') ? 'page' : 'content',
    downloadMode: 'browser',
    isIncognito: false,
    script: {
      name: script.metadata.name,
      namespace: script.metadata.namespace,
      version: script.metadata.version,
      description: script.metadata.description,
      author: script.metadata.author,
      matches: [...script.metadata.matches],
      includes: [...script.metadata.includes],
      excludeMatches: [...script.metadata.excludeMatches],
      excludes: [...script.metadata.excludes],
      runAt: script.metadata.runAt,
      noframes: script.metadata.noframes,
      resources: { ...script.metadata.resources },
    },
    scriptMetaStr: script.source.code.match(
      /\/\/[ \t]*==UserScript==[\s\S]*?\/\/[ \t]*==\/UserScript==/,
    )?.[0],
    resources: Object.fromEntries(
      Object.entries(bundle.resources).map(([name, resource]) => [
        name,
        resource.url,
      ]),
    ),
    ...(frameId === undefined ? {} : { frameId }),
  };
}
