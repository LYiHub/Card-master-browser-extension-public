import { t } from '../../localization/messages';
import { parseUserscriptMetadata } from '../domain/metadata';

export const MAX_EDITABLE_USERSCRIPT_NAME_LENGTH = 160;
export const MAX_EDITABLE_USERSCRIPT_DESCRIPTION_LENGTH = 512;

type EditableMetadata = {
  name: string;
  description: string;
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
        String(required ? '不能为空，且' : ''),
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
) {
  const metadata = parsed.metadata;
  if (!metadata) return null;
  for (const locale of ['zh-cn', 'zh-tw']) {
    if (!metadata.localized[locale]?.[field]) continue;
    return (
      metadata.entries.find(
        (entry) => entry.normalizedKey === `${field}:${locale}`,
      )?.key ?? null
    );
  }
  return null;
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

  let block = replaceDirective(metadataBlock, 'name', name);
  block = replaceDirective(block, 'description', description);
  const localizedNameKey = preferredLocalizedKey(parsed, 'name');
  const localizedDescriptionKey = preferredLocalizedKey(parsed, 'description');
  if (localizedNameKey) {
    block = replaceDirective(block, localizedNameKey, name);
  }
  if (localizedDescriptionKey) {
    block = replaceDirective(block, localizedDescriptionKey, description);
  }
  return (
    source.slice(0, start) + block + source.slice(start + metadataBlock.length)
  );
}
