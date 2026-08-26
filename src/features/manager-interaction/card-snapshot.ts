type ManagerCardSnapshotOptions = {
  title: string;
  accent: string;
  state?: {
    enabled: boolean;
    enabledLabel: string;
    disabledLabel: string;
  };
};

function roundRect(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  radius: number,
  inset = 0,
) {
  ctx.beginPath();
  ctx.roundRect(
    inset,
    inset,
    width - inset * 2,
    height - inset * 2,
    Math.max(0, radius - inset),
  );
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
) {
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = width / height;
  let sx = 0;
  let sy = 0;
  let sw = sourceWidth;
  let sh = sourceHeight;
  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio;
    sx = (sourceWidth - sw) / 2;
  } else {
    sh = sourceWidth / targetRatio;
    sy = (sourceHeight - sh) / 2;
  }
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, width, height);
}

export function readManagerCardSnapshotMedia(element: HTMLElement) {
  const cover = element.querySelector<HTMLImageElement>('.manager-card__cover');
  if (cover?.complete && cover.naturalWidth > 0 && cover.naturalHeight > 0) {
    return {
      source: cover as CanvasImageSource,
      width: cover.naturalWidth,
      height: cover.naturalHeight,
    };
  }

  const video = element.querySelector<HTMLVideoElement>('video');
  if (video && video.readyState >= 2 && video.videoWidth > 0) {
    return {
      source: video as CanvasImageSource,
      width: video.videoWidth,
      height: video.videoHeight,
    };
  }
  return null;
}

export async function createManagerCardSnapshot(
  element: HTMLElement,
  { title, accent, state }: ManagerCardSnapshotOptions,
) {
  const cover = element.querySelector<HTMLImageElement>('.manager-card__cover');
  if (cover && (!cover.complete || cover.naturalWidth === 0)) {
    await cover.decode().catch(() => undefined);
  }

  const canvas = document.createElement('canvas');
  const displayWidth = Math.max(1, element.getBoundingClientRect().width);
  canvas.width = Math.round(
    Math.min(
      210,
      Math.max(150, displayWidth * Math.min(devicePixelRatio, 1.25)),
    ),
  );
  canvas.height = Math.round((canvas.width * 406) / 280);
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) return canvas;

  const radius = (6 / 150) * canvas.width;
  roundRect(ctx, canvas.width, canvas.height, radius);
  ctx.clip();
  const media = readManagerCardSnapshotMedia(element);
  if (media) {
    drawCover(
      ctx,
      media.source,
      media.width,
      media.height,
      canvas.width,
      canvas.height,
    );
  } else {
    const fallback = ctx.createLinearGradient(
      0,
      0,
      canvas.width,
      canvas.height,
    );
    fallback.addColorStop(0, accent);
    fallback.addColorStop(1, '#080b0d');
    ctx.fillStyle = fallback;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  const shade = ctx.createLinearGradient(
    0,
    canvas.height * 0.55,
    0,
    canvas.height,
  );
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.9)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#f2e6c5';
  ctx.font = '700 24px "Cinzel", "Songti SC", STSong, SimSun, serif';
  ctx.fillText(title, 22, 383, 174);

  if (state) {
    ctx.fillStyle = 'rgba(4, 9, 10, 0.78)';
    ctx.fillRect(15, 15, 88, 25);
    ctx.fillStyle = state.enabled ? '#9ce7ae' : '#b7bdbd';
    ctx.font = '700 14px "Cinzel", "Songti SC", STSong, SimSun, serif';
    ctx.fillText(
      state.enabled ? state.enabledLabel : state.disabledLabel,
      27,
      33,
      66,
    );
  }

  ctx.strokeStyle = 'rgba(5, 8, 10, 0.82)';
  ctx.lineWidth = 4;
  roundRect(ctx, canvas.width, canvas.height, radius, 3);
  ctx.stroke();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2;
  roundRect(ctx, canvas.width, canvas.height, radius, 1);
  ctx.stroke();

  const edge = element.querySelector<HTMLImageElement>('.card-material__edge');
  if (edge?.complete && edge.naturalWidth > 0) {
    ctx.drawImage(edge, 0, 0, canvas.width, canvas.height);
  }
  return canvas;
}
