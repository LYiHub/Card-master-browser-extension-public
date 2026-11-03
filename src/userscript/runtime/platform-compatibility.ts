import { t } from '../../localization/messages';
import type { InstalledUserscript, MetadataDiagnostic } from '../domain/types';

export type UserscriptRuntimePlatform = 'chromium' | 'firefox' | 'safari';

type PlatformGrantLimitation = {
  code: string;
  grants: readonly string[];
  message: string;
};

const SAFARI_GRANT_LIMITATIONS: readonly PlatformGrantLimitation[] = [
  {
    code: 'safari-download-unsupported',
    grants: ['GM_download', 'GM.download'],
    get message() {
      return t('cm_platform_compatibility_message_1');
    },
  },
  {
    code: 'safari-notification-unsupported',
    grants: ['GM_notification', 'GM.notification'],
    get message() {
      return t('cm_platform_compatibility_message_2');
    },
  },
];

function grantLine(script: InstalledUserscript, grants: readonly string[]) {
  return script.metadata.entries.find(
    (entry) => entry.normalizedKey === 'grant' && grants.includes(entry.value),
  )?.line;
}

export function userscriptPlatformCompatibilityDiagnostics(
  script: InstalledUserscript,
  platform: UserscriptRuntimePlatform,
): MetadataDiagnostic[] {
  if (platform !== 'safari') return [];
  return SAFARI_GRANT_LIMITATIONS.flatMap((limitation) =>
    limitation.grants.some((grant) => script.metadata.grants.includes(grant))
      ? [
          {
            severity: 'warning' as const,
            code: limitation.code,
            message: limitation.message,
            line: grantLine(script, limitation.grants),
          },
        ]
      : [],
  );
}
