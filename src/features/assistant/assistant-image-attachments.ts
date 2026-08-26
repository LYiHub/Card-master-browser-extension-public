import {
  type AiImageAttachment,
  type AiImageMimeType,
  isAiImageMimeType,
} from '../../ai/domain/types';

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
    reader.onerror = () => reject(new Error('读取图片失败。'));
    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error('读取图片失败。'));
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
    throw new Error('仅支持 PNG、JPEG、WebP 和 GIF 图片。');
  }
  if (file.size <= 0) throw new Error('所选图片为空。');
  return {
    id: crypto.randomUUID(),
    name: '参考图片',
    mimeType,
    size: file.size,
    available: true,
    dataUrl: await readDataUrl(new Blob([file], { type: mimeType })),
  };
}
