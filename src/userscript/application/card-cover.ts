import { t } from '../../localization/messages';
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
  constructor(message = t('cm_card_cover_text_1')) {
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
    throw new Error(t('cm_card_cover_error_2'));
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
  if (!context) throw new Error(t('cm_card_cover_error_3'));
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
      t('cm_card_cover_error_4', [
        String(
          Math.floor(MAX_USERSCRIPT_COVER_IMAGE_DATA_URL_LENGTH / 1024 / 1024),
        ),
      ]),
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
    throw new Error(t('cm_card_cover_error_5'));
  }
  if (source.size > MAX_USERSCRIPT_COVER_UPLOAD_BYTES) {
    throw new Error(t('cm_card_cover_error_6'));
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
      video.onerror = () => reject(new Error(t('cm_card_cover_error_7')));
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
    throw new Error(t('cm_card_cover_error_8'));
  }
  if (source.size > MAX_USERSCRIPT_COVER_UPLOAD_BYTES) {
    throw new Error(t('cm_card_cover_error_9'));
  }
  const poster = await userscriptCoverVideoPoster(source);
  const video = await dataUrl(source);
  if (!isUserscriptCoverVideoDataUrl(video)) {
    throw new Error(t('cm_card_cover_error_10'));
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
