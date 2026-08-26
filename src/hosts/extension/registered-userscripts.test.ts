import { describe, expect, it } from 'vitest';

import { INITIAL_USERSCRIPTS } from '../../userscript/fixtures';
import {
  registeredUnsafeWindowBridge,
  registeredUserscript,
} from './registered-userscripts';

function registrationCode(
  registration: ReturnType<typeof registeredUserscript>,
) {
  const code = registration?.js?.[0]?.code;
  if (!code) throw new Error('Expected generated Userscript code.');
  return code;
}

describe('registeredUserscript', () => {
  it('builds a USER_SCRIPT registration with the GM command bridge', () => {
    const registration = registeredUserscript(INITIAL_USERSCRIPTS[0]);
    if (!registration) throw new Error('Expected an enabled registration.');

    expect(registration.id).toMatch(/^card-/);
    expect(registration.world).toBe('USER_SCRIPT');
    expect(registration.worldId).toMatch(/^card-world-/);
    expect(registration.matches).toEqual(
      INITIAL_USERSCRIPTS[0].metadata.matches,
    );
    expect(registration.allFrames).toBe(false);
    const code = registrationCode(registration);
    expect(code).toContain('register-command');
    expect(code).toContain('__serializeCommandResult');
    expect(code).toContain('value: __serializeCommandResult(value)');
    expect(code).toContain('while (__callbacks.has(id))');
    expect(code).toContain('__port.onDisconnect.addListener');
    expect(code).not.toContain('Userscript manager initialization timed out.');
    expect(code).toContain('__values = await __initialized;');
    expect(code).toContain("message?.type === 'values-reset'");
    expect(code).toContain('const __execute = new Function');
    expect(code).toContain('await __execute.call(globalThis');
    expect(code).not.toContain('"\'use strict\';\\\\n"');
    expect(code).not.toContain('[Card Master][userscript-runtime]');
    expect(code).toContain("Object.defineProperty(globalThis, 'fetch'");
    expect(code).toContain("__provide('fetch', __privilegedFetch)");
    expect(code).toContain('type: requestType');
    expect(code).toContain("'fetch-request'");
    expect(code).toContain("message?.type === 'http-event'");
    expect(code).toContain("requestDetails.responseType === 'document'");
    expect(code).toContain('__callRequestHandler(onloadend');
    expect(code).toContain('readyState: 4');
    expect(code).toContain('status: 0');
    expect(code).toContain('const __privilegedFetch');
    expect(code).toContain('sourceURL=card-master-');
    expect(code).not.toContain('sourceURL=userscript-userscript-');
    expect(() => new Function(code)).not.toThrow();
  });

  it('does not block style-only scripts on background value initialization', () => {
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        grants: ['GM_addStyle', 'GM_registerMenuCommand'],
        runAt: 'document-start' as const,
      },
    };
    const registration = registeredUserscript(script);
    const code = registrationCode(registration);

    expect(registration?.runAt).toBe('document_start');
    expect(code).not.toContain('__values = await __initialized;');
    expect(code).toContain('void __initialized.then');
    expect(() => new Function(code)).not.toThrow();
  });

  it('uses the MAIN world for @grant none and skips disabled scripts', () => {
    const grantNone = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        grants: ['none'],
      },
    };
    const registration = registeredUserscript(grantNone);
    if (!registration) throw new Error('Expected an enabled registration.');
    expect(registration?.world).toBe('MAIN');
    expect(registration.worldId).toBeUndefined();
    expect(() => new Function(registrationCode(registration))).not.toThrow();
    const isolated = registeredUserscript({
      ...grantNone,
      source: {
        ...grantNone.source,
        code: `${grantNone.source.code}\nconst __report = 'script-owned';`,
      },
    });
    if (!isolated) throw new Error('Expected an isolated MAIN registration.');
    expect(() => new Function(registrationCode(isolated))).not.toThrow();
    expect(
      registeredUserscript({
        ...grantNone,
        manager: { ...grantNone.manager, enabled: false },
      }),
    ).toBeNull();
  });

  it('registers broadly when a compatible runtime-only match glob is present', () => {
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        matches: ['https://example.com/*', '*://*.*.163.com/news/*'],
      },
    };
    const registration = registeredUserscript(script);
    if (!registration) throw new Error('Expected an enabled registration.');

    expect(registration.matches).toEqual(['<all_urls>']);
    expect(registrationCode(registration)).toContain('163\\\\.com');
  });

  it('inlines ordered @require code and named @resource payloads', () => {
    const registration = registeredUserscript(INITIAL_USERSCRIPTS[0], {
      requires: ['const dependencyFromRequire = 42;'],
      resources: {
        theme: {
          url: 'https://example.com/theme.css',
          text: 'body { color: red; }',
          dataUrl: 'data:text/css;base64,Ym9keQ==',
        },
      },
    });
    if (!registration) throw new Error('Expected an enabled registration.');
    const code = registrationCode(registration);

    expect(code).toContain('const dependencyFromRequire = 42;');
    expect(code).toContain('body { color: red; }');
    expect(code).toContain('GM_getResourceText');
    expect(code).toContain('GM_xmlhttpRequest');
    expect(() => new Function(code)).not.toThrow();
  });

  it('injects the explicitly granted global AI capability without credentials', () => {
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        grants: ['CM_ai', 'CM.ai'],
      },
    };
    const code = registrationCode(registeredUserscript(script));

    expect(code).toContain("type: 'ai-request'");
    expect(code).toContain("type: 'abort-ai-request'");
    expect(code).toContain("__provide('CM_ai', __ai)");
    expect(code).toContain("__provide('CM', { ai: __ai })");
    expect(code).not.toContain('Bearer ');
    expect(() => new Function(code)).not.toThrow();
  });

  it('injects legacy and modern clipboard APIs into the user-script world', () => {
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        grants: ['GM_setClipboard', 'GM.setClipboard'],
      },
    };
    const code = registrationCode(registeredUserscript(script));

    expect(code).toContain("__provide('GM_setClipboard'");
    expect(code).toContain("setClipboard: __granted('GM.setClipboard')");
    expect(code).toContain("document.execCommand('copy')");
    expect(() => new Function(code)).not.toThrow();
  });

  it('injects the complete privileged Userscript API through one capability bridge', () => {
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        grants: [
          'GM_addElement',
          'GM_download',
          'GM_notification',
          'GM_openInTab',
          'GM_getTab',
          'GM_saveTab',
          'GM_getTabs',
          'GM_getValues',
          'GM_setValues',
          'GM_deleteValues',
          'GM_addValueChangeListener',
          'GM_removeValueChangeListener',
          'GM_webRequest',
          'GM_cookie',
          'GM_audio',
        ],
      },
    };
    const code = registrationCode(registeredUserscript(script));

    expect(code).toContain("type: 'capability-request'");
    expect(code).toContain("__provide('GM_openInTab'");
    expect(code).toContain("__provide('GM_notification'");
    expect(code).toContain("__provide('GM_download'");
    expect(code).toContain('details: requestDetails');
    expect(code).not.toContain('details: normalized');
    expect(code).toContain("responseType: 'blob'");
    expect(code).toContain('normalized.headers');
    expect(code).toContain('normalized.cookie');
    expect(code).toContain('let abortRequested = false');
    expect(code).toContain("error?.kind === 'timeout'");
    expect(code).toContain("'download-cancel'");
    expect(code).toContain("__provide('GM_cookie'");
    expect(code).toContain("__provide('GM_audio'");
    expect(code).toContain("__provide('GM_webRequest'");
    expect(code).toContain('__addValueChangeListener');
    expect(code).not.toContain('trustedTypes?.createPolicy');
    expect(code).toContain('trustedTypes?.defaultPolicy?.createHTML');
    expect(code).toContain('element.innerHTML = __html(value)');
    expect(code).toContain('element.textContent = String(value ??');
    expect(() => new Function(code)).not.toThrow();
  });

  it('exposes real page interop in the MAIN world', () => {
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        grants: ['unsafeWindow', 'window.onurlchange'],
        sandbox: 'raw' as const,
      },
    };
    const registration = registeredUserscript(script);
    const code = registrationCode(registration);

    expect(registration?.world).toBe('MAIN');
    expect(code).toContain('unsafeWindow');
    expect(code).toContain('window)');
    expect(code).toContain("new Event('urlchange')");
    expect(() => new Function(code)).not.toThrow();
  });

  it('bridges legacy and modern menu commands from the MAIN world', () => {
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        grants: [
          'unsafeWindow',
          'GM_registerMenuCommand',
          'GM_unregisterMenuCommand',
          'GM.registerMenuCommand',
          'GM.unregisterMenuCommand',
        ],
        sandbox: 'raw' as const,
      },
    };
    const registration = registeredUserscript(script);
    const code = registrationCode(registration);

    expect(registration?.world).toBe('MAIN');
    expect(code).toContain('main-world-command-invocation');
    expect(code).toContain('register-command');
    expect(code).toContain('command-result');
    expect(code).toContain('__serializeCommandResult');
    expect(code).toContain('value: __serializeCommandResult(value)');
    expect(code).toContain('GM_registerMenuCommand');
    expect(code).toContain('registerMenuCommand: async');
    expect(() => new Function(code)).not.toThrow();
  });

  it('implicitly bridges unsafeWindow without moving privileged APIs into the MAIN world', () => {
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        grants: [
          'GM_xmlhttpRequest',
          'GM_registerMenuCommand',
          'GM_unregisterMenuCommand',
          'GM_openInTab',
          'GM_getValue',
          'GM_setValue',
          'GM_notification',
        ],
        sandbox: 'JavaScript' as const,
      },
    };
    const registration = registeredUserscript(script);
    const bridge = registeredUnsafeWindowBridge(script);

    expect(registration?.world).toBe('USER_SCRIPT');
    expect(bridge?.world).toBe('MAIN');
    expect(bridge?.id).toContain('-unsafe-window');
    expect(registrationCode(registration)).toContain(
      "__provide('unsafeWindow', __unsafeWindow)",
    );
    expect(registrationCode(registration)).toContain("operation: 'call'");
    expect(registrationCode(registration)).toContain('referenceId');
    expect(registrationCode(bridge)).toContain('__storeReference');
    expect(registrationCode(bridge)).toContain(
      'document.addEventListener(__eventName, __handle, true)',
    );
    expect(registrationCode(bridge)).toContain(
      'document.dispatchEvent(new Event(__readyEventName))',
    );
    expect(registrationCode(registration)).toContain('setTimeout(resolve, 25)');
    expect(registrationCode(registration)).toContain(
      "__reportError(new Error('The unsafeWindow page bridge is unavailable.'))",
    );
    expect(registrationCode(registration)).not.toContain(
      "throw new Error('The unsafeWindow page bridge is unavailable.')",
    );
    expect(() => new Function(registrationCode(registration))).not.toThrow();
    expect(() => new Function(registrationCode(bridge))).not.toThrow();
  });

  it('uses simple include patterns as a native browser prefilter', () => {
    const registration = registeredUserscript({
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        matches: [],
        includes: ['https://example.com/*'],
        excludes: ['https://example.com/private/*'],
      },
    });

    expect(registration?.matches).toEqual(['https://example.com/*']);
    expect(registration?.excludeMatches).toEqual(
      expect.arrayContaining(['https://example.com/private/*']),
    );
    expect(registration?.excludeMatches).toEqual(
      expect.arrayContaining(['*://accounts.google.com/*']),
    );
  });

  it('keeps complex include semantics in the exact in-script matcher', () => {
    const registration = registeredUserscript({
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        matches: [],
        includes: ['https://example.com/search?q=*'],
      },
    });

    expect(registration?.matches).toEqual(['<all_urls>']);
    expect(registrationCode(registration)).toContain('__matchPlan');
  });
});
