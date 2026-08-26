import bilibiliFavoritesFixSource from '../../../vendor/bilibili/userscripts/bilibili-favorites-fix.user.js?raw';
import bilikitCoreSource from '../../../vendor/bilibili/userscripts/bilikit-core.user.js?raw';
import bilikitFeedSource from '../../../vendor/bilibili/userscripts/bilikit-feed.user.js?raw';
import copyingLiftedSource from '../../../vendor/userscripts/copying-lifted.user.js?raw';
import {
  type PreinstalledCardVariant,
  preinstalledCardMedia,
} from '../../lib/userscript-deck-media';
import {
  parseUserscriptMetadata,
  userscriptIdentity,
} from '../domain/metadata';
import type {
  InstalledUserscript,
  UserscriptManagerConfig,
  UserscriptMetadata,
  UserscriptPresentation,
} from '../domain/types';
import { createUserscriptSource } from './install-service';

const PREINSTALL_STATE_VERSION = 1;
const PREINSTALL_DEFAULTS_REVISION = 1;
const FAVORITES_FIX_ID = 'preinstalled-bilibili-favorites-fix';
export const COPYING_LIFTED_ID = 'preinstalled-copying-lifted';

export type PreinstalledUserscriptState = {
  version: typeof PREINSTALL_STATE_VERSION;
  defaultsRevision: number;
  processedIds: string[];
  contentRevisions: Record<string, string>;
};

type PreinstalledUserscriptDefinition = {
  id: string;
  source: string;
  origin: string;
  enabled: boolean;
  checkForUpdates: boolean;
  hidden: boolean;
  presentation: UserscriptPresentation;
  metadata: UserscriptMetadata;
  identity: string;
  contentRevision: string;
};

export function preinstalledUserscriptContentRevision(source: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function definition(
  input: Omit<
    PreinstalledUserscriptDefinition,
    'metadata' | 'identity' | 'contentRevision'
  >,
): PreinstalledUserscriptDefinition {
  const parsed = parseUserscriptMetadata(input.source);
  if (!parsed.metadata) {
    throw new Error(
      `预装用户脚本 ${input.id} 的元数据无效：${parsed.diagnostics
        .map((diagnostic) => diagnostic.message)
        .join(' ')}`,
    );
  }
  return {
    ...input,
    metadata: parsed.metadata,
    identity: userscriptIdentity(parsed.metadata),
    contentRevision: preinstalledUserscriptContentRevision(input.source),
  };
}

function presentation(
  variant: PreinstalledCardVariant,
): UserscriptPresentation {
  const media = preinstalledCardMedia(variant);
  return {
    accent: media.accent,
    media: {
      kind: 'video',
      video: media.video,
    },
  };
}

function presentationImage(
  variant: PreinstalledCardVariant,
): UserscriptPresentation {
  const media = preinstalledCardMedia(variant);
  return {
    accent: media.accent,
    media: {
      kind: 'image',
      image: media.poster,
    },
  };
}

export const PREINSTALLED_USERSCRIPTS = [
  definition({
    id: 'preinstalled-bilikit-core',
    source: bilikitCoreSource,
    origin:
      'https://update.greasyfork.org/scripts/585248/BiliKit%20Core.user.js',
    enabled: true,
    checkForUpdates: true,
    hidden: false,
    presentation: presentation('01-bilikit-core'),
  }),
  definition({
    id: 'preinstalled-bilikit-feed',
    source: bilikitFeedSource,
    origin:
      'https://update.greasyfork.org/scripts/585249/BiliKit%20Feed.user.js',
    enabled: false,
    checkForUpdates: true,
    hidden: false,
    presentation: presentation('02-bilikit-feed'),
  }),
  definition({
    id: FAVORITES_FIX_ID,
    source: bilibiliFavoritesFixSource,
    origin:
      'https://update.greasyfork.org/scripts/489224/%E5%93%94%E5%93%A9%E5%93%94%E5%93%A9%28B%E7%AB%99%7CBilibili%29%E6%94%B6%E8%97%8F%E5%A4%B9Fix%20%28cerenkov%E4%BF%AE%E6%94%B9%E7%89%88%29.user.js',
    enabled: true,
    checkForUpdates: true,
    hidden: false,
    presentation: presentation('03-bilibili-favorites-fix'),
  }),
  definition({
    id: COPYING_LIFTED_ID,
    source: copyingLiftedSource,
    origin:
      'https://update.greasyfork.org/scripts/416195/Copying%20Lifted%20%E8%A7%A3%E9%99%A4%E5%A4%8D%E5%88%B6%E9%99%90%E5%88%B6.user.js',
    enabled: true,
    checkForUpdates: false,
    hidden: true,
    presentation: presentationImage('04-copying-lifted'),
  }),
] as const;

export function normalizePreinstalledUserscriptState(
  value: unknown,
): PreinstalledUserscriptState {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    (value as { version?: unknown }).version !== PREINSTALL_STATE_VERSION ||
    !Array.isArray((value as { processedIds?: unknown }).processedIds)
  ) {
    return {
      version: PREINSTALL_STATE_VERSION,
      defaultsRevision: 0,
      processedIds: [],
      contentRevisions: {},
    };
  }
  const defaultsRevision =
    typeof (value as { defaultsRevision?: unknown }).defaultsRevision ===
      'number' &&
    Number.isFinite((value as { defaultsRevision: number }).defaultsRevision) &&
    (value as { defaultsRevision: number }).defaultsRevision >= 0
      ? Math.floor((value as { defaultsRevision: number }).defaultsRevision)
      : 0;
  const processedIds = [
    ...new Set(
      (value as { processedIds: unknown[] }).processedIds.filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      ),
    ),
  ];
  const contentRevisionsValue = (value as { contentRevisions?: unknown })
    .contentRevisions;
  const contentRevisions =
    contentRevisionsValue &&
    typeof contentRevisionsValue === 'object' &&
    !Array.isArray(contentRevisionsValue)
      ? Object.fromEntries(
          Object.entries(contentRevisionsValue).filter(
            (entry): entry is [string, string] =>
              entry[0].length > 0 &&
              typeof entry[1] === 'string' &&
              entry[1].length > 0,
          ),
        )
      : {};
  return {
    version: PREINSTALL_STATE_VERSION,
    defaultsRevision,
    processedIds,
    contentRevisions,
  };
}

function manager(
  enabled: boolean,
  checkForUpdates: boolean,
): UserscriptManagerConfig {
  return {
    enabled,
    checkForUpdates,
    userMatches: [],
    userIncludes: [],
    userExcludeMatches: [],
    userExcludes: [],
  };
}

export function mergePendingPreinstalledUserscripts(
  current: readonly InstalledUserscript[],
  state: PreinstalledUserscriptState,
  options: {
    now?: () => number;
    random?: () => number;
  } = {},
) {
  const processedIds = new Set(state.processedIds);
  const contentRevisions = { ...state.contentRevisions };
  const existingIdentities = new Set(
    current.map((script) => userscriptIdentity(script.metadata)),
  );
  const addedIds: string[] = [];
  const hideCardIds: string[] = [];
  const changedIds = new Set<string>();
  let scripts = [...current];

  for (const preinstalled of PREINSTALLED_USERSCRIPTS) {
    const index = scripts.findIndex((script) => script.id === preinstalled.id);
    if (index < 0) continue;
    const script = scripts[index];
    const installedRevision = preinstalledUserscriptContentRevision(
      script.source.code,
    );
    if (installedRevision === preinstalled.contentRevision) {
      contentRevisions[preinstalled.id] = preinstalled.contentRevision;
      continue;
    }
    const recordedRevision = contentRevisions[preinstalled.id];
    const managedLegacySource = recordedRevision
      ? installedRevision === recordedRevision
      : script.source.origin === preinstalled.origin &&
        script.source.updatedAt === script.source.installedAt;
    if (!managedLegacySource) continue;
    const timestamp = (options.now ?? Date.now)();
    scripts[index] = {
      ...script,
      manager: {
        ...script.manager,
        checkForUpdates: preinstalled.checkForUpdates,
      },
      source: {
        ...script.source,
        code: preinstalled.source,
        origin: preinstalled.origin,
        updatedAt: timestamp,
      },
      metadata: preinstalled.metadata,
      runtime: {
        ...script.runtime,
        instanceId: null,
        status: script.manager.enabled ? 'idle' : 'sleeping',
        commands: [],
        pendingRefresh: script.manager.enabled,
      },
    };
    contentRevisions[preinstalled.id] = preinstalled.contentRevision;
    changedIds.add(preinstalled.id);
  }

  for (const preinstalled of PREINSTALLED_USERSCRIPTS) {
    if (processedIds.has(preinstalled.id)) continue;
    processedIds.add(preinstalled.id);
    if (existingIdentities.has(preinstalled.identity)) continue;

    const installation = createUserscriptSource(scripts, {
      source: preinstalled.source,
      origin: preinstalled.origin,
      manager: manager(preinstalled.enabled, preinstalled.checkForUpdates),
      presentation: preinstalled.presentation,
      createId: () => preinstalled.id,
      now: options.now ?? Date.now,
      random: options.random,
    });
    scripts = installation.scripts;
    existingIdentities.add(preinstalled.identity);
    contentRevisions[preinstalled.id] = preinstalled.contentRevision;
    addedIds.push(preinstalled.id);
    if (preinstalled.hidden) hideCardIds.push(preinstalled.id);
    changedIds.add(preinstalled.id);
  }

  return {
    scripts,
    addedIds,
    hideCardIds,
    changedIds: [...changedIds],
    state: {
      version: PREINSTALL_STATE_VERSION,
      defaultsRevision: PREINSTALL_DEFAULTS_REVISION,
      processedIds: [...processedIds],
      contentRevisions,
    } satisfies PreinstalledUserscriptState,
  };
}
