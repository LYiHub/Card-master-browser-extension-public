import { getLocale } from '../../localization/locale';
import { t } from '../../localization/messages';
import type {
  LocalizedUserscriptMetadata,
  MetadataDiagnostic,
  UserscriptMetadata,
  UserscriptMetadataEntry,
  UserscriptRunAt,
  UserscriptSandbox,
} from './types';

const METADATA_BLOCK =
  /\/\/[ \t]*==UserScript==([\s\S]*?)\/\/[ \t]*==\/UserScript==/m;
const METADATA_LINE = /^[ \t]*\/\/[ \t]*@(\S+)(?:[ \t]+(.*))?$/;
const RUN_AT_VALUES = new Set<UserscriptRunAt>([
  'document-start',
  'document-body',
  'document-end',
  'document-idle',
]);
const DEFAULT_RUN_AT: UserscriptRunAt = 'document-end';
const SINGLETON_KEYS = [
  'name',
  'namespace',
  'version',
  'description',
  'author',
  'copyright',
  'license',
  'icon',
  'icon64',
  'icon64url',
  'homepage',
  'homepageurl',
  'website',
  'source',
  'supporturl',
  'downloadurl',
  'updateurl',
  'changelog',
  'run-at',
  'sandbox',
  'noframes',
] as const;
export const SUPPORTED_USERSCRIPT_METADATA_KEYS = new Set([
  ...SINGLETON_KEYS,
  'match',
  'include',
  'exclude-match',
  'exclude',
  'grant',
  'require',
  'resource',
  'connect',
  'contributor',
  'antifeature',
  'compatible',
  'incompatible',
  'tag',
  'defaulticon',
  'iconurl',
  'installurl',
  'downloadmode',
]);
const HTTP_PROTOCOLS = new Set(['http:', 'https:']);
const RESOURCE_PROTOCOLS = new Set(['http:', 'https:', 'data:']);
const LOCALE_PATTERN = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;
const SANDBOX_VALUES = new Map<string, UserscriptSandbox>([
  ['raw', 'raw'],
  ['javascript', 'JavaScript'],
  ['dom', 'DOM'],
]);

export type ParsedMetadata = {
  metadata: UserscriptMetadata | null;
  diagnostics: MetadataDiagnostic[];
  block: string | null;
};

function first(raw: Record<string, string[]>, key: string) {
  return raw[key]?.[0]?.trim() ?? '';
}

function list(raw: Record<string, string[]>, key: string) {
  return [...(raw[key] ?? [])];
}

function lineNumberAt(source: string, offset: number) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (source.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

function entriesFor(
  entries: readonly UserscriptMetadataEntry[],
  normalizedKey: string,
) {
  return entries.filter((entry) => entry.normalizedKey === normalizedKey);
}

function metadataBaseKey(normalizedKey: string) {
  const separator = normalizedKey.indexOf(':');
  return separator < 0 ? normalizedKey : normalizedKey.slice(0, separator);
}

function validateUrlEntry(
  entry: UserscriptMetadataEntry,
  protocols: ReadonlySet<string>,
  diagnostics: MetadataDiagnostic[],
  allowNone = false,
) {
  if (allowNone && entry.value.toLowerCase() === 'none') return;
  let url: URL;
  try {
    url = new URL(entry.value);
  } catch {
    diagnostics.push({
      severity: 'error',
      code: 'invalid-metadata-url',
      message: t('cm_metadata_message_1', [String(entry.key)]),
      line: entry.line,
    });
    return;
  }
  if (protocols.has(url.protocol)) return;
  diagnostics.push({
    severity: 'error',
    code: 'unsupported-metadata-url-protocol',
    message: t('cm_metadata_message_2', [
      String(entry.key),
      String(url.protocol),
    ]),
    line: entry.line,
  });
}

function validateConnectEntry(
  entry: UserscriptMetadataEntry,
  diagnostics: MetadataDiagnostic[],
) {
  const value = entry.value.trim().toLowerCase();
  if (value === '*' || value === 'self') return;
  const hostname = value.startsWith('*.') ? value.slice(2) : value;
  try {
    const url = new URL(`https://${hostname}`);
    if (
      url.hostname === hostname &&
      !url.username &&
      !url.password &&
      url.port === '' &&
      url.pathname === '/'
    ) {
      return;
    }
  } catch {
    // Report the normalized declaration below.
  }
  diagnostics.push({
    severity: 'error',
    code: 'invalid-connect',
    message: t('cm_metadata_message_3', [String(entry.key)]),
    line: entry.line,
  });
}

function parseLocalizedMetadata(
  entries: readonly UserscriptMetadataEntry[],
  diagnostics: MetadataDiagnostic[],
) {
  const localized: Record<string, LocalizedUserscriptMetadata> = {};
  for (const entry of entries) {
    const separator = entry.normalizedKey.indexOf(':');
    if (separator < 0) continue;
    const field = entry.normalizedKey.slice(0, separator);
    if (field !== 'name' && field !== 'description') continue;
    const locale = entry.normalizedKey.slice(separator + 1);
    if (!LOCALE_PATTERN.test(locale)) {
      diagnostics.push({
        severity: 'warning',
        code: 'invalid-metadata-locale',
        message: t('cm_metadata_message_4', [String(entry.key)]),
        line: entry.line,
      });
    }
    const values = localized[locale] ?? {};
    if (values[field]) {
      diagnostics.push({
        severity: 'warning',
        code: 'duplicate-localized-metadata',
        message: t('cm_metadata_message_5', [String(entry.key)]),
        line: entry.line,
      });
      continue;
    }
    values[field] = entry.value;
    localized[locale] = values;
  }
  return localized;
}

function parseResources(
  entries: readonly UserscriptMetadataEntry[],
  diagnostics: MetadataDiagnostic[],
) {
  const resources: Record<string, string> = {};
  for (const entry of entries) {
    const value = entry.value;
    const separator = value.search(/\s/);
    const name = value.slice(0, separator);
    const url = value.slice(separator).trim();
    if (separator <= 0 || !/^\w\S*$/.test(name) || !url) {
      diagnostics.push({
        severity: 'error',
        code: 'invalid-resource',
        message: t('cm_metadata_message_6', [
          String(value || t('cm_metadata_text_1')),
        ]),
        line: entry.line,
      });
      continue;
    }
    if (Object.hasOwn(resources, name)) {
      diagnostics.push({
        severity: 'error',
        code: 'duplicate-resource',
        message: t('cm_metadata_message_7', [String(name)]),
        line: entry.line,
      });
      continue;
    }
    validateUrlEntry({ ...entry, value: url }, RESOURCE_PROTOCOLS, diagnostics);
    resources[name] = url;
  }
  return resources;
}

function parseSandbox(
  raw: Record<string, string[]>,
  entries: readonly UserscriptMetadataEntry[],
  diagnostics: MetadataDiagnostic[],
) {
  const requested = first(raw, 'sandbox');
  if (!requested) return undefined;
  const sandbox = SANDBOX_VALUES.get(requested.toLowerCase());
  if (sandbox) return sandbox;
  diagnostics.push({
    severity: 'warning',
    code: 'unknown-sandbox',
    message: t('cm_metadata_message_8', [String(requested)]),
    line: entriesFor(entries, 'sandbox')[0]?.line,
  });
  return undefined;
}

export function parseUserscriptMetadata(code: string): ParsedMetadata {
  const diagnostics: MetadataDiagnostic[] = [];
  if (/^\s*</.test(code)) {
    return {
      metadata: null,
      diagnostics: [
        {
          severity: 'error',
          code: 'html-source',
          message: t('cm_metadata_message_9'),
        },
      ],
      block: null,
    };
  }

  const blockMatch = METADATA_BLOCK.exec(code);
  if (!blockMatch) {
    return {
      metadata: null,
      diagnostics: [
        {
          severity: 'error',
          code: 'missing-metadata-block',
          message: t('cm_metadata_message_10'),
        },
      ],
      block: null,
    };
  }

  const raw: Record<string, string[]> = {};
  const entries: UserscriptMetadataEntry[] = [];
  const block = blockMatch[0];
  const blockContent = blockMatch[1];
  const blockContentOffset =
    blockMatch.index + Math.max(0, block.indexOf(blockContent));
  const firstBlockContentLine = lineNumberAt(code, blockContentOffset);
  for (const [index, line] of blockContent.split(/\r?\n/).entries()) {
    const lineMatch = METADATA_LINE.exec(line);
    if (!lineMatch) {
      if (/^[ \t]*\/\/[ \t]*@/.test(line)) {
        diagnostics.push({
          severity: 'error',
          code: 'malformed-metadata-line',
          message: t('cm_metadata_message_11'),
          line: firstBlockContentLine + index,
        });
      }
      continue;
    }
    const originalKey = lineMatch[1];
    const normalizedKey = originalKey.toLowerCase();
    const value = lineMatch[2]?.trim() ?? '';
    const entry = {
      key: originalKey,
      normalizedKey,
      value,
      line: firstBlockContentLine + index,
    };
    entries.push(entry);
    const values = raw[normalizedKey] ?? [];
    values.push(value);
    raw[normalizedKey] = values;
  }

  for (const key of SINGLETON_KEYS) {
    const declarations = entriesFor(entries, key);
    for (const duplicate of declarations.slice(1)) {
      diagnostics.push({
        severity: 'warning',
        code: 'duplicate-singleton-metadata',
        message: t('cm_metadata_message_12', [String(duplicate.key)]),
        line: duplicate.line,
      });
    }
  }

  const name = first(raw, 'name');
  if (!name) {
    diagnostics.push({
      severity: 'error',
      code: 'missing-name',
      message: t('cm_metadata_message_13'),
      line: lineNumberAt(code, blockMatch.index),
    });
  }

  const requestedRunAt = first(raw, 'run-at') || DEFAULT_RUN_AT;
  const runAt = RUN_AT_VALUES.has(requestedRunAt as UserscriptRunAt)
    ? (requestedRunAt as UserscriptRunAt)
    : DEFAULT_RUN_AT;
  if (requestedRunAt !== runAt) {
    diagnostics.push({
      severity: 'error',
      code: 'unsupported-run-at',
      message: t('cm_metadata_message_14', [String(requestedRunAt)]),
      line: entriesFor(entries, 'run-at')[0]?.line,
    });
  }

  for (const key of [
    'icon',
    'icon64',
    'icon64url',
    'defaulticon',
    'iconurl',
  ] as const) {
    for (const entry of entriesFor(entries, key)) {
      validateUrlEntry(entry, RESOURCE_PROTOCOLS, diagnostics);
    }
  }
  for (const key of [
    'homepage',
    'homepageurl',
    'website',
    'source',
    'supporturl',
  ] as const) {
    for (const entry of entriesFor(entries, key)) {
      validateUrlEntry(entry, HTTP_PROTOCOLS, diagnostics);
    }
  }
  for (const key of ['downloadurl', 'updateurl', 'installurl'] as const) {
    for (const entry of entriesFor(entries, key)) {
      validateUrlEntry(entry, HTTP_PROTOCOLS, diagnostics, true);
    }
  }
  for (const entry of entriesFor(entries, 'require')) {
    validateUrlEntry(entry, RESOURCE_PROTOCOLS, diagnostics);
  }
  for (const entry of entriesFor(entries, 'connect')) {
    validateConnectEntry(entry, diagnostics);
  }

  const localized = parseLocalizedMetadata(entries, diagnostics);
  const metadata: UserscriptMetadata = {
    name,
    namespace: first(raw, 'namespace'),
    version: first(raw, 'version') || '0.0.0',
    description: first(raw, 'description'),
    author: first(raw, 'author'),
    contributors: list(raw, 'contributor'),
    copyright: first(raw, 'copyright'),
    license: first(raw, 'license'),
    icon:
      first(raw, 'icon') ||
      first(raw, 'iconurl') ||
      first(raw, 'defaulticon') ||
      undefined,
    icon64: first(raw, 'icon64') || first(raw, 'icon64url') || undefined,
    homepageUrl:
      first(raw, 'homepageurl') ||
      first(raw, 'homepage') ||
      first(raw, 'website') ||
      first(raw, 'source') ||
      undefined,
    supportUrl: first(raw, 'supporturl') || undefined,
    downloadUrl: first(raw, 'downloadurl') || undefined,
    updateUrl: first(raw, 'updateurl') || undefined,
    matches: list(raw, 'match'),
    includes: list(raw, 'include'),
    excludeMatches: list(raw, 'exclude-match'),
    excludes: list(raw, 'exclude'),
    grants: list(raw, 'grant'),
    requires: list(raw, 'require'),
    resources: parseResources(entriesFor(entries, 'resource'), diagnostics),
    connects: list(raw, 'connect'),
    antifeatures: list(raw, 'antifeature'),
    compatible: list(raw, 'compatible'),
    incompatible: list(raw, 'incompatible'),
    tags: list(raw, 'tag'),
    runAt,
    sandbox: parseSandbox(raw, entries, diagnostics),
    noframes: Object.hasOwn(raw, 'noframes'),
    localized,
    entries,
    unknown: entries.filter(
      (entry) =>
        !SUPPORTED_USERSCRIPT_METADATA_KEYS.has(
          metadataBaseKey(entry.normalizedKey),
        ),
    ),
    raw,
  };

  if (metadata.matches.length === 0 && metadata.includes.length === 0) {
    diagnostics.push({
      severity: 'warning',
      code: 'missing-inclusion-rule',
      message: t('cm_metadata_message_15'),
      line: lineNumberAt(code, blockMatch.index),
    });
  }

  return {
    metadata: diagnostics.some((diagnostic) => diagnostic.severity === 'error')
      ? null
      : metadata,
    diagnostics,
    block: blockMatch[0],
  };
}

export function userscriptIdentity(metadata: UserscriptMetadata) {
  return `${metadata.namespace}\n${metadata.name}`;
}

function preferredLocalizedMetadata(
  metadata: UserscriptMetadata,
  field: keyof LocalizedUserscriptMetadata,
) {
  for (const locale of getLocale() === 'zh-TW'
    ? ['zh-tw', 'zh-hant', 'zh-hk', 'zh-cn', 'zh']
    : ['zh-cn', 'zh-hans', 'zh', 'zh-tw']) {
    const value = metadata.localized[locale]?.[field]?.trim();
    if (value) return value;
  }
  return metadata[field];
}

export function userscriptDisplayName(metadata: UserscriptMetadata) {
  return preferredLocalizedMetadata(metadata, 'name');
}

export function userscriptDisplayDescription(metadata: UserscriptMetadata) {
  return preferredLocalizedMetadata(metadata, 'description');
}

export function stripUserscriptMetadata(code: string) {
  return code.replace(METADATA_BLOCK, '');
}

export function formatMetadataDiagnostic(diagnostic: MetadataDiagnostic) {
  return diagnostic.line
    ? t('cm_metadata_text_16', [
        String(diagnostic.line),
        String(diagnostic.message),
      ])
    : diagnostic.message;
}
