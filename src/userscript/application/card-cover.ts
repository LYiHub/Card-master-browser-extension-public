import {
  isUserscriptCoverImageDataUrl,
  isUserscriptCoverVideoDataUrl,
  MAX_USERSCRIPT_COVER_IMAGE_DATA_URL_LENGTH,
  type UserscriptPresentation,
} from '../domain/types';
import { deriveCardAccentFromImageSource } from './card-accent';

export const USERSCRIPT_COVER_WIDTH = 480;
export const USERSCRIPT_COVER_HEIGHT = 640;
export const MAX_USERSCRIPT_COVER_PROMPT_LENGTH = 2_000;
export const MAX_USERSCRIPT_COVER_UPLOAD_BYTES = 20 * 1024 * 1024;

export type GeneratedUserscriptCover = {
  dataUrl: string;
  width: number;
  height: number;
  mimeType: 'image/webp';
  accent: string;
};

export class UserscriptCoverConfigurationRequiredError extends Error {
  constructor(
    message = 'OpenAI 兼容图像服务尚未配置，请在卡牌大师智能体的设置中完成图像生成配置。',
  ) {
    super(message);
    this.name = 'UserscriptCoverConfigurationRequiredError';
  }
}

export interface UserscriptCoverController {
  isConfigured(): Promise<boolean>;
  generate(
    prompt: string,
    injectDefaultStyle: boolean,
  ): Promise<GeneratedUserscriptCover>;
}

function base64(bytes: ArrayBuffer) {
  const view = new Uint8Array(bytes);
  let binary = '';
  for (let offset = 0; offset < view.length; offset += 8_192) {
    binary += String.fromCharCode(...view.subarray(offset, offset + 8_192));
  }
  return btoa(binary);
}

async function dataUrl(blob: Blob) {
  return `data:${blob.type};base64,${base64(await blob.arrayBuffer())}`;
}

export function userscriptCoverCropRect(width: number, height: number) {
  if (width <= 0 || height <= 0) {
    throw new Error('封面媒体没有有效的画面尺寸。');
  }
  const sourceRatio = width / height;
  const targetRatio = USERSCRIPT_COVER_WIDTH / USERSCRIPT_COVER_HEIGHT;
  if (sourceRatio > targetRatio) {
    const cropWidth = height * targetRatio;
    return {
      x: (width - cropWidth) / 2,
      y: 0,
      width: cropWidth,
      height,
    };
  }
  const cropHeight = width / targetRatio;
  return {
    x: 0,
    y: (height - cropHeight) / 2,
    width,
    height: cropHeight,
  };
}

async function renderUserscriptCoverFrame(
  source: CanvasImageSource,
  width: number,
  height: number,
): Promise<GeneratedUserscriptCover> {
  const crop = userscriptCoverCropRect(width, height);
  const canvas = new OffscreenCanvas(
    USERSCRIPT_COVER_WIDTH,
    USERSCRIPT_COVER_HEIGHT,
  );
  const context = canvas.getContext('2d');
  if (!context) throw new Error('浏览器无法创建卡牌封面绘图上下文。');
  context.drawImage(
    source,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    USERSCRIPT_COVER_WIDTH,
    USERSCRIPT_COVER_HEIGHT,
  );
  const accent = await deriveCardAccentFromImageSource(canvas);
  const optimized = await canvas.convertToBlob({
    type: 'image/webp',
    quality: 0.82,
  });
  const encoded = await dataUrl(optimized);
  if (!isUserscriptCoverImageDataUrl(encoded)) {
    throw new Error(
      `封面转换失败，生成结果无效或超过 ${Math.floor(
        MAX_USERSCRIPT_COVER_IMAGE_DATA_URL_LENGTH / 1024 / 1024,
      )} MB。`,
    );
  }
  return {
    dataUrl: encoded,
    width: USERSCRIPT_COVER_WIDTH,
    height: USERSCRIPT_COVER_HEIGHT,
    mimeType: 'image/webp',
    accent,
  };
}

export async function optimizeUserscriptCoverImage(
  source: Blob,
): Promise<GeneratedUserscriptCover> {
  if (!source.type.startsWith('image/')) {
    throw new Error('封面文件必须是图片。');
  }
  if (source.size > MAX_USERSCRIPT_COVER_UPLOAD_BYTES) {
    throw new Error('封面图片不能超过 20 MB。');
  }

  const bitmap = await createImageBitmap(source);
  try {
    return await renderUserscriptCoverFrame(
      bitmap,
      bitmap.width,
      bitmap.height,
    );
  } finally {
    bitmap.close();
  }
}

async function userscriptCoverVideoPoster(source: Blob) {
  const objectUrl = URL.createObjectURL(source);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () =>
        reject(
          new Error(
            '当前浏览器无法读取这个封面视频，请换用浏览器可播放的视频格式。',
          ),
        );
      video.src = objectUrl;
      video.load();
    });
    return await renderUserscriptCoverFrame(
      video,
      video.videoWidth,
      video.videoHeight,
    );
  } finally {
    video.onloadeddata = null;
    video.onerror = null;
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
}

export async function prepareUserscriptCoverMedia(
  source: Blob,
): Promise<UserscriptPresentation> {
  if (source.type.startsWith('image/')) {
    const image = await optimizeUserscriptCoverImage(source);
    return {
      accent: image.accent,
      media: { kind: 'image', image: image.dataUrl },
    };
  }
  if (!source.type.startsWith('video/')) {
    throw new Error('封面文件必须是图片或视频。');
  }
  if (source.size > MAX_USERSCRIPT_COVER_UPLOAD_BYTES) {
    throw new Error('封面视频不能超过 20 MB。');
  }
  const poster = await userscriptCoverVideoPoster(source);
  const video = await dataUrl(source);
  if (!isUserscriptCoverVideoDataUrl(video)) {
    throw new Error('封面视频编码失败或文件过大。');
  }
  return {
    accent: poster.accent,
    media: {
      kind: 'video',
      video,
      poster: poster.dataUrl,
    },
  };
}
