import type { UserscriptRequestHeaderAdapter } from '../../userscript/application/request-service';
import { USERSCRIPT_REQUEST_HEADER_RULE_ID } from '../../userscript/runtime/capabilities';

type DeclarativeNetRequestApi = Pick<
  typeof chrome.declarativeNetRequest,
  'getSessionRules' | 'updateSessionRules'
>;

type RequestHeaderAdapterOptions = {
  enabled?: boolean;
  reportError?: (event: string, error: unknown) => void;
};

const RESTRICTED_REQUEST_HEADERS = new Set([
  'cookie',
  'origin',
  'referer',
  'user-agent',
]);

function exactRequestRegex(value: string) {
  const url = new URL(value);
  url.hash = '';
  return `^${url.href.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`;
}

function partitionHeaders(headers: Headers) {
  const regular = new Headers();
  const restricted: chrome.declarativeNetRequest.ModifyHeaderInfo[] = [];
  for (const [name, value] of headers.entries()) {
    if (RESTRICTED_REQUEST_HEADERS.has(name.toLowerCase())) {
      restricted.push({ header: name, operation: 'set', value });
    } else {
      regular.append(name, value);
    }
  }
  return { regular, restricted };
}

export class ExtensionUserscriptRequestHeaderAdapter
  implements UserscriptRequestHeaderAdapter
{
  private queue = Promise.resolve();
  private readonly enabled: boolean;
  private readonly ready: Promise<void>;
  private readonly reportError: (event: string, error: unknown) => void;

  constructor(
    private readonly api: DeclarativeNetRequestApi,
    options: RequestHeaderAdapterOptions = {},
  ) {
    this.enabled = options.enabled ?? true;
    this.reportError = options.reportError ?? (() => undefined);
    this.ready = this.enabled
      ? this.removeStaleRule().catch((error) => {
          this.reportError('stale-rule-cleanup-failed', error);
        })
      : Promise.resolve();
  }

  async request<T>(
    url: string,
    headers: Headers,
    operation: (headers: Headers) => Promise<T>,
  ) {
    const { regular, restricted } = partitionHeaders(headers);
    if (!this.enabled || restricted.length === 0) {
      return await operation(headers);
    }
    return await this.serialized(async () => {
      await this.ready;
      try {
        await this.api.updateSessionRules({
          removeRuleIds: [USERSCRIPT_REQUEST_HEADER_RULE_ID],
          addRules: [
            {
              id: USERSCRIPT_REQUEST_HEADER_RULE_ID,
              priority: 1_000_000,
              action: {
                type: 'modifyHeaders',
                requestHeaders: restricted,
              },
              condition: {
                regexFilter: exactRequestRegex(url),
                resourceTypes: ['xmlhttprequest'],
                tabIds: [-1],
              },
            },
          ],
        });
      } catch (error) {
        this.reportError('rule-install-failed', error);
        return await operation(headers);
      }

      try {
        return await operation(regular);
      } finally {
        await this.api
          .updateSessionRules({
            removeRuleIds: [USERSCRIPT_REQUEST_HEADER_RULE_ID],
          })
          .catch((error) => {
            this.reportError('rule-cleanup-failed', error);
          });
      }
    });
  }

  private async removeStaleRule() {
    const rules = await this.api.getSessionRules();
    if (!rules.some((rule) => rule.id === USERSCRIPT_REQUEST_HEADER_RULE_ID)) {
      return;
    }
    await this.api.updateSessionRules({
      removeRuleIds: [USERSCRIPT_REQUEST_HEADER_RULE_ID],
    });
  }

  private async serialized<T>(operation: () => Promise<T>) {
    const previous = this.queue;
    let release: () => void = () => undefined;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
}
