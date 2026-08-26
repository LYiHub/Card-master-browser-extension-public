import { describe, expect, it, vi } from 'vitest';

import { INITIAL_USERSCRIPTS } from '../fixtures';
import {
  applyUserscriptUpdate,
  compareUserscriptVersions,
  UserscriptUpdateService,
} from './update-service';

function response(body: string, status = 200) {
  return new Response(body, { status });
}

describe('UserscriptUpdateService', () => {
  it('compares dotted Userscript versions numerically', () => {
    expect(compareUserscriptVersions('1.10.0', '1.9.9')).toBe(1);
    expect(compareUserscriptVersions('2.0', '2.0.0')).toBe(0);
    expect(compareUserscriptVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareUserscriptVersions('1.0.0-beta.2', '1.0.0-beta.10')).toBe(-1);
    expect(compareUserscriptVersions('1.0.0-beta', '1.0.0')).toBe(-1);
  });

  it('reports scripts without standard update metadata', async () => {
    const service = new UserscriptUpdateService(vi.fn());
    await expect(service.check(INITIAL_USERSCRIPTS[0])).resolves.toEqual({
      status: 'unavailable',
      reason: '脚本没有声明 @updateURL 或 @downloadURL。',
    });
  });

  it('allows a manual check when automatic checks are disabled', async () => {
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      manager: {
        ...INITIAL_USERSCRIPTS[0].manager,
        checkForUpdates: false,
      },
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        downloadUrl: 'https://example.com/script.user.js',
      },
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(response(script.source.code));
    const service = new UserscriptUpdateService(fetcher);

    await expect(service.check(script)).resolves.toEqual({
      status: 'disabled',
    });
    await expect(service.check(script, 'manual')).resolves.toMatchObject({
      status: 'current',
    });
  });

  it('finds and downloads a newer source with the same identity', async () => {
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        updateUrl: 'https://example.com/script.meta.js',
        downloadUrl: 'https://example.com/script.user.js',
      },
    };
    const newer = script.source.code.replace(
      '// @version     2.4.1',
      '// @version     2.5.0',
    );
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response(newer))
      .mockResolvedValueOnce(response(newer));
    const service = new UserscriptUpdateService(fetcher);

    const update = await service.check(script);
    expect(update).toMatchObject({ status: 'available', version: '2.5.0' });
    if (update.status !== 'available') throw new Error('Expected update.');
    await expect(service.download(update)).resolves.toEqual({
      source: newer,
    });
  });

  it('reports a newer metadata-only response without a download URL', async () => {
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        updateUrl: 'https://example.com/script.meta.js',
      },
    };
    const newerMetadata = script.source.code
      .replace('// @version     2.4.1', '// @version     2.5.0')
      .replace(/\n\n[\s\S]*$/, '');
    const service = new UserscriptUpdateService(
      vi.fn<typeof fetch>().mockResolvedValue(response(newerMetadata)),
    );

    await expect(service.check(script)).resolves.toMatchObject({
      status: 'available',
      version: '2.5.0',
      sourceUrl: null,
    });
  });

  it('rejects update metadata with a different script identity', async () => {
    const script = {
      ...INITIAL_USERSCRIPTS[0],
      metadata: {
        ...INITIAL_USERSCRIPTS[0].metadata,
        updateUrl: 'https://example.com/script.meta.js',
      },
    };
    const other = script.source.code.replace(
      '// @name        净域守望',
      '// @name        其他脚本',
    );
    const service = new UserscriptUpdateService(
      vi.fn<typeof fetch>().mockResolvedValue(response(other)),
    );

    await expect(service.check(script)).resolves.toMatchObject({
      status: 'unavailable',
      reason: expect.stringContaining('@namespace + @name'),
    });
  });

  it('preserves future grants as non-blocking update metadata', () => {
    const script = INITIAL_USERSCRIPTS[0];
    const source = script.source.code
      .replace('// @version     2.4.1', '// @version     2.5.0')
      .replace(
        '// @grant       GM_setValue',
        '// @grant       GM_totallyUnsupported',
      );

    expect(
      applyUserscriptUpdate(
        script,
        { source },
        {
          now: () => 2,
        },
      ).metadata.grants,
    ).toContain('GM_totallyUnsupported');
  });

  it('derives update metadata from source and rechecks identity and version', () => {
    const script = INITIAL_USERSCRIPTS[0];
    const otherIdentity = script.source.code
      .replace('// @version     2.4.1', '// @version     2.5.0')
      .replace('// @name        净域守望', '// @name        其他脚本');

    expect(() =>
      applyUserscriptUpdate(
        script,
        { source: otherIdentity },
        { now: () => 2 },
      ),
    ).toThrow('@namespace + @name');
    expect(() =>
      applyUserscriptUpdate(
        script,
        { source: script.source.code },
        { now: () => 2 },
      ),
    ).toThrow('版本没有高于');
  });
});
