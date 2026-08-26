import { describe, expect, it } from 'vitest';

import {
  CONTENT_BLOCKER_CARD_ID,
  startingContentBlockingSnapshot,
} from '../../content-blocking/domain/types';
import {
  contentBlockingCard,
  DECK_STEWARD_CARD,
} from '../../features/userscript-deck/cards';
import {
  USERSCRIPT_CARD_VARIANTS,
  userscriptCardMedia,
} from '../../lib/userscript-deck-media';
import { userscriptIdentity } from '../domain/metadata';
import { INITIAL_USERSCRIPTS } from '../fixtures';
import {
  exportUserscriptLibrary,
  formatLibraryImportReport,
  importUserscriptLibrary,
} from './library-transfer';
import { readZipArchive } from './zip-archive';

function archiveFile(blob: Blob, name = 'library.zip') {
  return {
    name,
    size: blob.size,
    type: blob.type,
    arrayBuffer: () => blob.arrayBuffer(),
  } as File;
}

describe('Userscript library transfer', () => {
  it('exports only Userscript records and never serializes system cards', async () => {
    const scripts = INITIAL_USERSCRIPTS.slice(0, 2);
    const entries = await readZipArchive(
      new Uint8Array(await exportUserscriptLibrary(scripts).arrayBuffer()),
    );
    const manifest = new TextDecoder().decode(
      entries.get('card-master-library.json'),
    );
    const systemCards = [
      DECK_STEWARD_CARD,
      contentBlockingCard(startingContentBlockingSnapshot(), null),
    ];

    expect(systemCards.map((card) => card.id)).toEqual([
      DECK_STEWARD_CARD.id,
      CONTENT_BLOCKER_CARD_ID,
    ]);
    expect(manifest).not.toContain(DECK_STEWARD_CARD.id);
    expect(manifest).not.toContain(CONTENT_BLOCKER_CARD_ID);
    expect(
      [...entries.keys()].filter((path) => path.endsWith('.user.js')),
    ).toHaveLength(scripts.length);
  });

  it('preserves local scripts and imports only new identities', async () => {
    const local = INITIAL_USERSCRIPTS[0];
    const duplicate = {
      ...local,
      source: {
        ...local.source,
        code: local.source.code.replace(
          '// @version     2.4.1',
          '// @version     9.9.9',
        ),
      },
    };
    const added = INITIAL_USERSCRIPTS[1];
    const result = await importUserscriptLibrary(
      archiveFile(exportUserscriptLibrary([duplicate, added])),
      [local],
    );

    expect(result.installed).toBe(1);
    expect(result.skipped).toEqual([
      expect.objectContaining({
        identity: userscriptIdentity(local.metadata),
      }),
    ]);
    expect(result.rejected).toEqual([]);
    expect(
      result.scripts.find((script) => script.id === local.id)?.source.code,
    ).toBe(local.source.code);
    expect(
      result.scripts.some(
        (script) =>
          userscriptIdentity(script.metadata) ===
          userscriptIdentity(added.metadata),
      ),
    ).toBe(true);
  });

  it('keeps the first occurrence of a duplicate identity inside one archive', async () => {
    const first = INITIAL_USERSCRIPTS[0];
    const duplicate = {
      ...first,
      id: 'duplicate-id',
      source: {
        ...first.source,
        code: first.source.code.replace(
          '// @version     2.4.1',
          '// @version     9.9.9',
        ),
      },
    };
    const result = await importUserscriptLibrary(
      archiveFile(exportUserscriptLibrary([first, duplicate])),
      [],
    );

    expect(result.installed).toBe(1);
    expect(result.skipped).toHaveLength(1);
    expect(result.scripts).toHaveLength(1);
    expect(result.scripts[0]?.source.code).toBe(first.source.code);
  });

  it('assigns missing covers in fixed order and preserves archived covers', async () => {
    const sequential = await importUserscriptLibrary(
      archiveFile(exportUserscriptLibrary(INITIAL_USERSCRIPTS)),
      [],
    );
    const archivedPresentation = {
      ...INITIAL_USERSCRIPTS[0],
      id: 'archived-presentation',
      presentation: {
        accent: userscriptCardMedia('05').accent,
        media: {
          kind: 'video' as const,
          video: userscriptCardMedia('05').video,
        },
      },
    };
    const preserved = await importUserscriptLibrary(
      archiveFile(exportUserscriptLibrary([archivedPresentation])),
      [],
    );

    const assigned = sequential.scripts.map((script) =>
      script.presentation?.media.kind === 'video'
        ? script.presentation.media.video
        : null,
    );
    const pool = USERSCRIPT_CARD_VARIANTS.map(
      (variant) => userscriptCardMedia(variant).video,
    );
    expect(new Set(assigned.slice(0, pool.length)).size).toBe(pool.length);
    expect(assigned.every((video) => video && pool.includes(video))).toBe(true);
    expect(preserved.scripts[0]?.presentation).toEqual(
      archivedPresentation.presentation,
    );
  });

  it('formats every skipped and rejected entry for clipboard reporting', () => {
    const report = formatLibraryImportReport('backup.zip', {
      scripts: [],
      installed: 2,
      skipped: [
        {
          path: 'duplicate.user.js',
          identity: 'namespace\nname',
          reason: '本机卡牌优先。',
        },
      ],
      rejected: [
        { path: 'first.user.js', reason: 'Line 10: invalid metadata.' },
        { path: 'second.user.js', reason: 'Line 20: unsupported grant.' },
      ],
      diagnostics: [],
    });

    expect(report).toContain('duplicate.user.js');
    expect(report).toContain('first.user.js');
    expect(report).toContain('second.user.js');
    expect(report).toContain('2 张未导入');
  });
});
