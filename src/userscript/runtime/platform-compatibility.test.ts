import { describe, expect, it } from 'vitest';

import { parseUserscriptMetadata } from '../domain/metadata';
import type { InstalledUserscript } from '../domain/types';
import { userscriptPlatformCompatibilityDiagnostics } from './platform-compatibility';

function scriptWithGrants(...grants: string[]): InstalledUserscript {
  const source = `// ==UserScript==
// @name Platform test
${grants.map((grant) => `// @grant ${grant}`).join('\n')}
// ==/UserScript==`;
  const parsed = parseUserscriptMetadata(source);
  if (!parsed.metadata) throw new Error('Test userscript metadata is invalid.');
  return {
    kind: 'userscript',
    id: 'platform-test',
    source: { code: source, installedAt: 1, updatedAt: 1 },
    metadata: parsed.metadata,
    manager: {
      enabled: true,
      checkForUpdates: true,
      userMatches: [],
      userIncludes: [],
      userExcludeMatches: [],
      userExcludes: [],
    },
    runtime: {
      tabId: 1,
      frameId: 0,
      instanceId: null,
      status: 'idle',
      commands: [],
      pendingRefresh: false,
    },
  };
}

describe('Userscript platform compatibility', () => {
  it('warns before Safari scripts use unsupported download and notification APIs', () => {
    const diagnostics = userscriptPlatformCompatibilityDiagnostics(
      scriptWithGrants('GM_download', 'GM.notification'),
      'safari',
    );

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      'safari-download-unsupported',
      'safari-notification-unsupported',
    ]);
    expect(
      diagnostics.every((diagnostic) => diagnostic.severity === 'warning'),
    ).toBe(true);
  });

  it('does not report Safari-only limitations on Chromium or Firefox', () => {
    const script = scriptWithGrants('GM_download', 'GM_notification');

    expect(
      userscriptPlatformCompatibilityDiagnostics(script, 'chromium'),
    ).toEqual([]);
    expect(
      userscriptPlatformCompatibilityDiagnostics(script, 'firefox'),
    ).toEqual([]);
  });
});
