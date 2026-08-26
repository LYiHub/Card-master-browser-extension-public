import type { InstalledUserscript, MetadataDiagnostic } from '../domain/types';

export const SUPPORTED_USERSCRIPT_GRANTS = new Set([
  'none',
  'unsafeWindow',
  'window.onurlchange',
  'GM_info',
  'GM_addElement',
  'GM_addStyle',
  'GM_log',
  'GM_download',
  'GM_notification',
  'GM_openInTab',
  'GM_getTab',
  'GM_saveTab',
  'GM_getTabs',
  'GM_getValue',
  'GM_setValue',
  'GM_deleteValue',
  'GM_listValues',
  'GM_getValues',
  'GM_setValues',
  'GM_deleteValues',
  'GM_addValueChangeListener',
  'GM_removeValueChangeListener',
  'GM_getResourceText',
  'GM_getResourceURL',
  'GM_xmlhttpRequest',
  'GM_webRequest',
  'GM_cookie',
  'GM_audio',
  'GM_setClipboard',
  'GM_registerMenuCommand',
  'GM_unregisterMenuCommand',
  'GM.info',
  'GM.addElement',
  'GM.addStyle',
  'GM.log',
  'GM.download',
  'GM.notification',
  'GM.openInTab',
  'GM.getTab',
  'GM.saveTab',
  'GM.getTabs',
  'GM.getValue',
  'GM.setValue',
  'GM.deleteValue',
  'GM.listValues',
  'GM.getValues',
  'GM.setValues',
  'GM.deleteValues',
  'GM.addValueChangeListener',
  'GM.removeValueChangeListener',
  'GM.getResourceText',
  'GM.getResourceUrl',
  'GM.getResourceURL',
  'GM.xmlHttpRequest',
  'GM.webRequest',
  'GM.cookie',
  'GM.audio',
  'GM.setClipboard',
  'GM.registerMenuCommand',
  'GM.unregisterMenuCommand',
  'CM_ai',
  'CM.ai',
]);

export const IGNORED_USERSCRIPT_EXECUTION_METADATA = [
  'inject-into',
  'unwrap',
] as const;

const MAIN_WORLD_GRANTS = new Set([
  'none',
  'unsafeWindow',
  'window.onurlchange',
  'GM_info',
  'GM_registerMenuCommand',
  'GM_unregisterMenuCommand',
  'GM.info',
  'GM.registerMenuCommand',
  'GM.unregisterMenuCommand',
]);

export function userscriptRunsInMainWorld(script: InstalledUserscript) {
  if (script.metadata.sandbox === 'raw') return true;
  if (
    script.metadata.sandbox === 'JavaScript' ||
    script.metadata.sandbox === 'DOM'
  ) {
    return false;
  }
  const grants = script.metadata.grants;
  const hasPrivilegedGrant = grants.some(
    (grant) => !MAIN_WORLD_GRANTS.has(grant),
  );
  return (
    grants.includes('none') ||
    (grants.includes('unsafeWindow') && !hasPrivilegedGrant)
  );
}

export function userscriptNeedsUnsafeWindowBridge(script: InstalledUserscript) {
  return (
    !script.metadata.grants.includes('none') &&
    !userscriptRunsInMainWorld(script)
  );
}

function metadataLine(
  script: InstalledUserscript,
  key: string,
  value?: string,
) {
  return script.metadata.entries.find(
    (entry) =>
      entry.normalizedKey === key &&
      (value === undefined || entry.value === value),
  )?.line;
}

export function runtimeCompatibilityDiagnostics(
  script: InstalledUserscript,
): MetadataDiagnostic[] {
  const diagnostics: MetadataDiagnostic[] = [];
  const grants = script.metadata.grants;
  if (grants.includes('none') && grants.length > 1) {
    diagnostics.push({
      severity: 'error',
      code: 'grant-none-conflict',
      message: '@grant none 不能与其他授权同时使用。',
      line: metadataLine(script, 'grant', 'none'),
    });
  }
  if (userscriptRunsInMainWorld(script)) {
    const unsupported = grants.filter((grant) => !MAIN_WORLD_GRANTS.has(grant));
    if (unsupported.length > 0) {
      diagnostics.push({
        severity: 'error',
        code: 'main-world-privileged-grant',
        message: `该脚本要求在页面真实环境中运行，但没有隔离桥接时无法提供以下特权授权：${unsupported.join(', ')}`,
        line:
          metadataLine(script, 'sandbox', 'raw') ??
          metadataLine(script, 'grant', 'unsafeWindow'),
      });
    }
  }
  for (const grant of grants) {
    if (SUPPORTED_USERSCRIPT_GRANTS.has(grant)) continue;
    diagnostics.push({
      severity: 'warning',
      code: 'unimplemented-grant',
      message: `该用户脚本授权会被保留，但当前运行时尚未实现：${grant}`,
      line: metadataLine(script, 'grant', grant),
    });
  }
  for (const key of IGNORED_USERSCRIPT_EXECUTION_METADATA) {
    if (!Object.hasOwn(script.metadata.raw, key)) continue;
    diagnostics.push({
      severity: 'warning',
      code: 'ignored-execution-metadata',
      message: `用户脚本元数据 @${key} 会被保留，但不会改变当前运行时行为。`,
      line: metadataLine(script, key),
    });
  }
  for (const entry of script.metadata.unknown) {
    if (
      IGNORED_USERSCRIPT_EXECUTION_METADATA.includes(
        entry.normalizedKey as (typeof IGNORED_USERSCRIPT_EXECUTION_METADATA)[number],
      )
    ) {
      continue;
    }
    diagnostics.push({
      severity: 'warning',
      code: 'unknown-metadata',
      message: `无法识别的用户脚本元数据会被保留，但不具备运行时行为：@${entry.key}`,
      line: entry.line,
    });
  }
  return diagnostics;
}

export function hasGrant(script: InstalledUserscript, grant: string) {
  return script.metadata.grants.includes(grant);
}
