import { describe, expect, it } from 'vitest';

import { parseUserscriptMetadata } from '../domain/metadata';
import { INITIAL_USERSCRIPTS } from '../fixtures';
import {
  runtimeCompatibilityDiagnostics,
  userscriptNeedsUnsafeWindowBridge,
  userscriptRunsInMainWorld,
} from './compatibility';

describe('runtime compatibility diagnostics', () => {
  it('accepts the supported core GM surface', () => {
    expect(runtimeCompatibilityDiagnostics(INITIAL_USERSCRIPTS[0])).toEqual([]);
  });

  it('accepts standard dependencies, resources, and resource grants', () => {
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        grants: [
          'GM_getResourceText',
          'GM_getResourceURL',
          'GM_xmlhttpRequest',
        ],
        requires: ['https://example.com/dependency.js'],
        resources: { theme: 'https://example.com/theme.css' },
        connects: ['api.example.com'],
      },
    };
    expect(runtimeCompatibilityDiagnostics(script)).toEqual([]);
  });

  it('accepts the explicit project AI grants', () => {
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        grants: ['CM_ai', 'CM.ai'],
      },
    };
    expect(runtimeCompatibilityDiagnostics(script)).toEqual([]);
  });

  it('accepts legacy and modern clipboard grants', () => {
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        grants: ['GM_setClipboard', 'GM.setClipboard'],
      },
    };
    expect(runtimeCompatibilityDiagnostics(script)).toEqual([]);
  });

  it('accepts the complete privileged Userscript capability surface', () => {
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

    expect(runtimeCompatibilityDiagnostics(script)).toEqual([]);
  });

  it('preserves unknown grants and ignored execution metadata without blocking', () => {
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        grants: ['GM_unknownCapability'],
        raw: {
          ...INITIAL_USERSCRIPTS[0].metadata.raw,
          'inject-into': ['content'],
        },
      },
    };

    expect(runtimeCompatibilityDiagnostics(script)).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'unimplemented-grant',
      }),
      expect.objectContaining({
        severity: 'warning',
        code: 'ignored-execution-metadata',
      }),
    ]);
  });

  it('rejects grant-none conflicts', () => {
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        grants: ['none', 'GM_addStyle'],
      },
    };
    expect(runtimeCompatibilityDiagnostics(script)).toContainEqual(
      expect.objectContaining({ code: 'grant-none-conflict' }),
    );
  });

  it('accepts sandbox metadata and reports unknown grants by source line', () => {
    const parsed = parseUserscriptMetadata(`// ==UserScript==
// @name        Unsupported
// @match       https://example.com/*
// @grant       GM_unknownCapability
// @sandbox     JavaScript
// ==/UserScript==`);
    if (!parsed.metadata) throw new Error('Expected parsed metadata.');
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: parsed.metadata,
    };

    expect(runtimeCompatibilityDiagnostics(script)).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'unimplemented-grant',
        line: 4,
      }),
    ]);
    expect(parsed.metadata.sandbox).toBe('JavaScript');
  });

  it('keeps explicit JavaScript sandboxes isolated and bridges unsafeWindow', () => {
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        grants: [
          'unsafeWindow',
          'window.onurlchange',
          'GM_xmlhttpRequest',
          'GM_registerMenuCommand',
          'GM_getValue',
          'GM_setValue',
        ],
        sandbox: 'JavaScript' as const,
      },
    };

    expect(runtimeCompatibilityDiagnostics(script)).toEqual([]);
    expect(userscriptRunsInMainWorld(script)).toBe(false);
    expect(userscriptNeedsUnsafeWindowBridge(script)).toBe(true);
  });

  it('provides unsafeWindow implicitly to privileged isolated scripts', () => {
    const privileged = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        grants: ['GM_xmlhttpRequest'],
      },
    };
    const grantNone = {
      ...privileged,
      metadata: {
        ...privileged.metadata,
        grants: ['none'],
      },
    };

    expect(userscriptRunsInMainWorld(privileged)).toBe(false);
    expect(userscriptNeedsUnsafeWindowBridge(privileged)).toBe(true);
    expect(userscriptNeedsUnsafeWindowBridge(grantNone)).toBe(false);
  });

  it('rejects privileged grants that cannot be exposed in the real page world', () => {
    const privilegedRaw = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        grants: ['GM_xmlhttpRequest'],
        sandbox: 'raw' as const,
      },
    };

    expect(runtimeCompatibilityDiagnostics(privilegedRaw)).toContainEqual(
      expect.objectContaining({ code: 'main-world-privileged-grant' }),
    );
  });

  it('supports menu commands in an explicit real-page sandbox', () => {
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

    expect(runtimeCompatibilityDiagnostics(script)).toEqual([]);
    expect(userscriptRunsInMainWorld(script)).toBe(true);
    expect(userscriptNeedsUnsafeWindowBridge(script)).toBe(false);
  });

  it('preserves unknown metadata as a visible non-blocking warning', () => {
    const parsed = parseUserscriptMetadata(`// ==UserScript==
// @name        Unknown Metadata
// @match       https://example.com/*
// @x-private   value
// @grant       none
// ==/UserScript==`);
    if (!parsed.metadata) throw new Error('Expected parsed metadata.');

    expect(
      runtimeCompatibilityDiagnostics({
        ...INITIAL_USERSCRIPTS[0],
        metadata: parsed.metadata,
      }),
    ).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        code: 'unknown-metadata',
        line: 4,
      }),
    );
  });
});
