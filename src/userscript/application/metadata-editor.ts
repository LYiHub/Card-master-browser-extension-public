import type { AppLocale } from '../../localization/locale';
import { t } from '../../localization/messages';
import {
  parseUserscriptMetadata,
  preferredLocalizedMetadataLocale,
  userscriptDisplayDescription,
  userscriptDisplayName,
} from '../domain/metadata';

export const MAX_EDITABLE_USERSCRIPT_NAME_LENGTH = 160;
export const MAX_EDITABLE_USERSCRIPT_DESCRIPTION_LENGTH = 512;

type EditableMetadata = {
  name: string;
  description: string;
  locale?: AppLocale;
};

function singleLine(
  value: string,
  label: string,
  maxLength: number,
  required: boolean,
) {
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > maxLength) {
    throw new Error(
      t('cm_metadata_editor_error_1', [
        String(label),
        String(required ? t('cm_metadata_editor_text_1') : ''),
        String(maxLength),
      ]),
    );
  }
  if (/[\r\n]/.test(value)) {
    throw new Error(t('cm_metadata_editor_error_2', [String(label)]));
  }
  return normalized;
}

function replaceDirective(block: string, key: string, value: string) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const line = new RegExp(`^(\\s*//\\s*@${escapedKey})(?:\\s+.*)?$`, 'mi');
  if (line.test(block)) {
    return block.replace(line, (_match, prefix: string) => {
      return `${prefix}       ${value}`;
    });
  }
  const newline = block.includes('\r\n') ? '\r\n' : '\n';
  const closing = /^(\s*\/\/\s*==\/UserScript==\s*)$/m;
  if (!closing.test(block)) {
    throw new Error(t('cm_metadata_editor_error_3'));
  }
  return block.replace(closing, (_match, marker: string) => {
    return `// @${key}       ${value}${newline}${marker}`;
  });
}

function preferredLocalizedKey(
  parsed: ReturnType<typeof parseUserscriptMetadata>,
  field: 'name' | 'description',
  appLocale: AppLocale | undefined,
) {
  const metadata = parsed.metadata;
  if (!metadata) return null;
  const locale = preferredLocalizedMetadataLocale(metadata, field, appLocale);
  return (
    metadata.entries.find(
      (entry) => entry.normalizedKey === `${field}:${locale}`,
    )?.key ?? null
  );
}

export function updateUserscriptEditableMetadata(
  source: string,
  input: EditableMetadata,
) {
  const parsed = parseUserscriptMetadata(source);
  if (!parsed.metadata) {
    throw new Error(
      parsed.diagnostics.map((diagnostic) => diagnostic.message).join(' '),
    );
  }
  const metadataBlock = parsed.block;
  if (!metadataBlock) throw new Error(t('cm_metadata_editor_error_4'));
  const name = singleLine(
    input.name,
    t('cm_metadata_editor_text_5'),
    MAX_EDITABLE_USERSCRIPT_NAME_LENGTH,
    true,
  );
  const description = singleLine(
    input.description,
    t('cm_metadata_editor_text_6'),
    MAX_EDITABLE_USERSCRIPT_DESCRIPTION_LENGTH,
    false,
  );
  const start = source.indexOf(metadataBlock);
  if (start < 0) throw new Error(t('cm_metadata_editor_error_7'));

  let block = metadataBlock;
  if (name !== userscriptDisplayName(parsed.metadata, input.locale)) {
    block = replaceDirective(block, 'name', name);
    const localizedNameKey = preferredLocalizedKey(
      parsed,
      'name',
      input.locale,
    );
    if (localizedNameKey) {
      block = replaceDirective(block, localizedNameKey, name);
    }
  }
  if (
    description !== userscriptDisplayDescription(parsed.metadata, input.locale)
  ) {
    block = replaceDirective(block, 'description', description);
    const localizedDescriptionKey = preferredLocalizedKey(
      parsed,
      'description',
      input.locale,
    );
    if (localizedDescriptionKey) {
      block = replaceDirective(block, localizedDescriptionKey, description);
    }
  }
  return (
    source.slice(0, start) + block + source.slice(start + metadataBlock.length)
  );
}
