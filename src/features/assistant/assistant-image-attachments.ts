import {
  type AiImageAttachment,
  type AiImageMimeType,
  isAiImageMimeType,
} from '../../ai/domain/types';
import { t } from '../../localization/messages';

function mimeTypeFromFile(file: File): AiImageMimeType | null {
  if (isAiImageMimeType(file.type)) return file.type;
  const extension = file.name.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    default:
      return null;
  }
}

function readDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error(t('cm_assistant_image_attachments_error_1')));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error(t('cm_assistant_image_attachments_error_2')));
        return;
      }
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  });
}

export async function prepareAiImageAttachment(
  file: File,
): Promise<AiImageAttachment> {
  const mimeType = mimeTypeFromFile(file);
  if (!mimeType) {
    throw new Error(t('cm_assistant_image_attachments_error_3'));
  }
  if (file.size <= 0)
    throw new Error(t('cm_assistant_image_attachments_error_4'));
  return {
    id: crypto.randomUUID(),
    name: t('cm_assistant_image_attachments_name_1'),
    mimeType,
    size: file.size,
    available: true,
    dataUrl: await readDataUrl(new Blob([file], { type: mimeType })),
  };
}
