import {
  DECK_ENTRY_SETTINGS_STORAGE_KEY,
  normalizeDeckEntrySettings,
} from '../features/userscript-deck/deck-entry';
import type { ExtensionBackgroundApi } from '../hosts/extension/api';
import { updateExtensionDeckEntrySettings } from '../hosts/extension/deck-entry-background';
import {
  type NewTabPreferencesRepository,
  normalizeNewTabPreferences,
  synchronizedPreferences,
} from '../new-tab/application/preferences';
import {
  hydrateScript,
  isStoredScript,
  type StoredScript,
  storedScript,
  type TransactionalScriptRepository,
} from '../userscript/application/script-repository';
import { userscriptIdentity } from '../userscript/domain/metadata';
import type { InstalledUserscript } from '../userscript/domain/types';
import {
  canonical,
  type Json,
  type SyncEntries,
  type SyncScope,
  scopeFor,
} from './model';

type SyncScript = Omit<StoredScript, 'id'>;
type ScriptChangeCommit = (
  previous: Awaited<ReturnType<TransactionalScriptRepository['list']>>,
  next: Awaited<ReturnType<TransactionalScriptRepository['list']>>,
) => Promise<unknown>;

function jsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Json;
}

function scriptKey(script: StoredScript) {
  return `script:${encodeURIComponent(userscriptIdentity(hydrateScript(script).metadata))}`;
}

function scriptValue(script: StoredScript): SyncScript {
  const { id: _id, source, manager, presentation } = script;
  return {
    source,
    manager,
    ...(presentation &&
    (presentation.media.kind === 'image'
      ? !presentation.media.image.startsWith('data:')
      : !presentation.media.video.startsWith('data:') &&
        !presentation.media.poster?.startsWith('data:'))
      ? { presentation }
      : {}),
  };
}

function scriptFromValue(value: unknown, id: string): StoredScript | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = { ...(value as Record<string, unknown>), id };
  return isStoredScript(candidate) ? candidate : null;
}

function entriesForScripts(scripts: readonly StoredScript[]) {
  return Object.fromEntries(
    scripts.map((script) => [
      scriptKey(script),
      {
        name: `脚本：${script.source.code.slice(0, 80)}`,
        value: jsonValue(scriptValue(script)),
      },
    ]),
  ) as SyncEntries;
}

export class SyncProjection {
  constructor(
    private readonly api: ExtensionBackgroundApi,
    private readonly repository: TransactionalScriptRepository,
    private readonly newTab: NewTabPreferencesRepository,
    private readonly commitScripts: ScriptChangeCommit,
  ) {}

  async readEntries(
    scopes: readonly SyncScope[] = ['scripts', 'preferences', 'newTab'],
  ): Promise<SyncEntries> {
    const [scripts, storedDeck, newTab] = await Promise.all([
      this.repository.list(),
      this.api.storage.local.get(DECK_ENTRY_SETTINGS_STORAGE_KEY),
      this.newTab.read(),
    ]);
    const deck = normalizeDeckEntrySettings(
      storedDeck[DECK_ENTRY_SETTINGS_STORAGE_KEY],
    );
    const entries = {
      ...entriesForScripts(scripts.map(storedScript)),
      'deck:settings': { name: '牌阵入口设置', value: jsonValue(deck) },
      'newTab:preferences': {
        name: '新标签页偏好',
        value: jsonValue(synchronizedPreferences(newTab)),
      },
    };
    return Object.fromEntries(
      Object.entries(entries).filter(([key]) => scopes.includes(scopeFor(key))),
    ) as SyncEntries;
  }

  async applyEntries(
    next: SyncEntries,
    before: SyncEntries,
    scopes: readonly SyncScope[] = ['scripts', 'preferences', 'newTab'],
  ) {
    const skipped = new Set<string>();
    const changedScripts = await this.repository.transact((current) => {
      const nextScripts = new Map<string, StoredScript>();
      const currentMap = new Map(
        current.map((script) => [scriptKey(storedScript(script)), script]),
      );
      for (const [key, beforeEntry] of Object.entries(before)) {
        if (
          !scopes.includes(scopeFor(key)) ||
          scopeFor(key) !== 'scripts' ||
          canonical(awaitEntry(currentMap, key)) === canonical(beforeEntry)
        )
          continue;
        skipped.add(key);
      }
      for (const [key, entry] of Object.entries(next)) {
        if (
          !scopes.includes(scopeFor(key)) ||
          scopeFor(key) !== 'scripts' ||
          skipped.has(key)
        )
          continue;
        const current = currentMap.get(key);
        if (!entry) continue;
        const script = scriptFromValue(
          entry.value,
          current?.id ?? `installed-userscript-${crypto.randomUUID()}`,
        );
        if (script) nextScripts.set(key, script);
      }
      const result = current.filter((script) => {
        const key = scriptKey(storedScript(script));
        if (
          !scopes.includes(scopeFor(key)) ||
          scopeFor(key) !== 'scripts' ||
          skipped.has(key)
        )
          return true;
        return nextScripts.has(key);
      });
      for (const [key, script] of nextScripts) {
        const index = result.findIndex(
          (candidate) => scriptKey(storedScript(candidate)) === key,
        );
        const hydrated = hydrateScript(script);
        if (index < 0) result.push(hydrated);
        else result[index] = hydrated;
      }
      return {
        scripts: result,
        result: {
          changed:
            canonical(result.map(storedScript)) !==
            canonical(current.map(storedScript)),
          previous: [...current],
        },
      };
    });
    if (changedScripts.result.changed)
      await this.commitScripts(
        changedScripts.result.previous,
        changedScripts.scripts,
      );

    const deckEntry = next['deck:settings'];
    if (
      scopes.includes('preferences') &&
      deckEntry &&
      !skipped.has('deck:settings')
    ) {
      const current = normalizeDeckEntrySettings(
        (await this.api.storage.local.get(DECK_ENTRY_SETTINGS_STORAGE_KEY))[
          DECK_ENTRY_SETTINGS_STORAGE_KEY
        ],
      );
      if (canonical(current) === canonical(before['deck:settings'])) {
        await updateExtensionDeckEntrySettings(this.api, () =>
          normalizeDeckEntrySettings(deckEntry.value),
        );
      } else skipped.add('deck:settings');
    }
    const newTabEntry = next['newTab:preferences'];
    if (
      scopes.includes('newTab') &&
      newTabEntry &&
      !skipped.has('newTab:preferences')
    ) {
      const current = await this.newTab.read();
      if (
        canonical(synchronizedPreferences(current)) ===
        canonical(before['newTab:preferences'])
      ) {
        await this.newTab.adoptSynchronized(
          normalizeNewTabPreferences(newTabEntry.value),
        );
      } else skipped.add('newTab:preferences');
    }
    return { skipped };
  }
}

function awaitEntry(map: Map<string, InstalledUserscript>, key: string) {
  const script = map.get(key);
  return script
    ? { name: key, value: jsonValue(scriptValue(storedScript(script))) }
    : null;
}
