export const USERSCRIPT_CAPABILITIES = [
  'open-tab',
  'close-tab',
  'notification-create',
  'notification-close',
  'download-start',
  'download-cancel',
  'tab-data-get',
  'tab-data-save',
  'tab-data-list',
  'cookie-list',
  'cookie-set',
  'cookie-delete',
  'audio-set-muted',
  'audio-get-state',
  'audio-subscribe',
  'audio-unsubscribe',
  'web-request-register',
  'web-request-unregister',
] as const;

export type UserscriptCapability = (typeof USERSCRIPT_CAPABILITIES)[number];

export const USERSCRIPT_WEB_REQUEST_RULE_ID_START = 1_700_000_000;
export const USERSCRIPT_WEB_REQUEST_RULE_ID_END = 1_749_999_999;
export const USERSCRIPT_REQUEST_HEADER_RULE_ID = 1_799_999_999;

export function isUserscriptRuleId(ruleId: number) {
  return (
    (ruleId >= USERSCRIPT_WEB_REQUEST_RULE_ID_START &&
      ruleId <= USERSCRIPT_WEB_REQUEST_RULE_ID_END) ||
    ruleId === USERSCRIPT_REQUEST_HEADER_RULE_ID
  );
}

export function isUserscriptWebRequestRuleId(ruleId: number) {
  return (
    ruleId >= USERSCRIPT_WEB_REQUEST_RULE_ID_START &&
    ruleId <= USERSCRIPT_WEB_REQUEST_RULE_ID_END
  );
}

const CAPABILITY_GRANTS: Record<UserscriptCapability, readonly string[]> = {
  'open-tab': ['GM_openInTab', 'GM.openInTab'],
  'close-tab': ['GM_openInTab', 'GM.openInTab'],
  'notification-create': ['GM_notification', 'GM.notification'],
  'notification-close': ['GM_notification', 'GM.notification'],
  'download-start': ['GM_download', 'GM.download'],
  'download-cancel': ['GM_download', 'GM.download'],
  'tab-data-get': ['GM_getTab', 'GM.getTab'],
  'tab-data-save': ['GM_saveTab', 'GM.saveTab'],
  'tab-data-list': ['GM_getTabs', 'GM.getTabs'],
  'cookie-list': ['GM_cookie', 'GM.cookie'],
  'cookie-set': ['GM_cookie', 'GM.cookie'],
  'cookie-delete': ['GM_cookie', 'GM.cookie'],
  'audio-set-muted': ['GM_audio', 'GM.audio'],
  'audio-get-state': ['GM_audio', 'GM.audio'],
  'audio-subscribe': ['GM_audio', 'GM.audio'],
  'audio-unsubscribe': ['GM_audio', 'GM.audio'],
  'web-request-register': ['GM_webRequest', 'GM.webRequest'],
  'web-request-unregister': ['GM_webRequest', 'GM.webRequest'],
};

export function isUserscriptCapability(
  value: unknown,
): value is UserscriptCapability {
  return (
    typeof value === 'string' &&
    (USERSCRIPT_CAPABILITIES as readonly string[]).includes(value)
  );
}

export function capabilityGranted(
  capability: UserscriptCapability,
  grants: readonly string[],
) {
  return CAPABILITY_GRANTS[capability].some((grant) => grants.includes(grant));
}

export type UserscriptCapabilityEvent =
  | {
      capability: 'open-tab';
      eventId: string;
      event: 'closed';
      data: { tabId: number };
    }
  | {
      capability: 'notification';
      eventId: string;
      event: 'clicked' | 'closed';
      data: { byUser?: boolean };
    }
  | {
      capability: 'download';
      eventId: string;
      event: 'changed';
      data: {
        downloadId: number;
        state?: 'in_progress' | 'complete' | 'interrupted';
        error?: string;
        bytesReceived?: number;
        totalBytes?: number;
      };
    }
  | {
      capability: 'audio';
      eventId: string;
      event: 'changed';
      data: UserscriptAudioState;
    }
  | {
      capability: 'web-request';
      eventId: string;
      event: 'matched';
      data: {
        ruleIndex: number;
        request: {
          requestId: string;
          url: string;
          method: string;
          type: string;
          tabId: number;
          frameId: number;
          parentFrameId: number;
          initiator?: string;
          timeStamp: number;
        };
      };
    };

export type UserscriptAudioState = {
  tabId: number;
  muted: boolean;
};

export type UserscriptExecutionCapability =
  | { status: 'available' }
  | {
      status:
        | 'browser-setting-required'
        | 'permission-required'
        | 'unsupported'
        | 'unavailable';
      message: string;
    };

export function userscriptExecutionAvailable(
  capability: UserscriptExecutionCapability | null | undefined,
) {
  return capability?.status === 'available';
}
