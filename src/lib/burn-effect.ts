type BurnProfile = {
  cellLarge: number;
  cellMain: number;
  cellDetail: number;
  columnCellA: number;
  columnCellB: number;
  largeAmp: number;
  mainAmp: number;
  detailAmp: number;
  edgeAmpA: number;
  edgeAmpB: number;
  edgeAmpC: number;
  freqA: number;
  freqB: number;
  freqC: number;
  speedA: number;
  speedB: number;
  speedC: number;
  phaseA: number;
  phaseB: number;
  phaseC: number;
  columnAmpA: number;
  columnAmpB: number;
  slant: number;
  bow: number;
  glowBand: number;
  charBand: number;
  emberBurst: number;
  flameBoost: number;
};

type EmberParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  glow: number;
};

type SmokeParticle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  grow: number;
  life: number;
  maxLife: number;
};

export type BurnAnimator = {
  start: () => Promise<void>;
  cancel: () => void;
};

function makeRadialSprite(size: number, stops: Array<[number, string]>) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const gradient = ctx.createRadialGradient(
    size * 0.5,
    size * 0.5,
    0,
    size * 0.5,
    size * 0.5,
    size * 0.5,
  );
  stops.forEach((stop) => {
    gradient.addColorStop(stop[0], stop[1]);
  });

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(size * 0.5, size * 0.5, size * 0.5, 0, Math.PI * 2);
  ctx.fill();

  return canvas;
}

const getBurnAssets = (() => {
  let cached: { smoke: HTMLCanvasElement; ember: HTMLCanvasElement } | null =
    null;

  return () => {
    if (cached) return cached;

    cached = {
      smoke: makeRadialSprite(128, [
        [0, 'rgba(150,150,150,0.22)'],
        [0.45, 'rgba(95,95,95,0.12)'],
        [1, 'rgba(30,30,30,0)'],
      ]),
      ember: makeRadialSprite(96, [
        [0, 'rgba(255,242,180,1)'],
        [0.25, 'rgba(255,170,72,0.92)'],
        [0.68, 'rgba(255,90,20,0.28)'],
        [1, 'rgba(255,60,10,0)'],
      ]),
    };

    return cached;
  };
})();

const smoothstep = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const rand = (min: number, max: number) => min + Math.random() * (max - min);
const clampNumber = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function makeValueNoise2D(width: number, height: number, cell: number) {
  const gridWidth = Math.ceil(width / cell) + 3;
  const gridHeight = Math.ceil(height / cell) + 3;
  const grid = new Float32Array(gridWidth * gridHeight);

  for (let index = 0; index < grid.length; index += 1) {
    grid[index] = Math.random() * 2 - 1;
  }

  const output = new Float32Array(width * height);

  for (let y = 0; y < height; y += 1) {
    const gridY = y / cell;
    const integerY = Math.floor(gridY);
    const ty = smoothstep(gridY - integerY);

    for (let x = 0; x < width; x += 1) {
      const gridX = x / cell;
      const integerX = Math.floor(gridX);
      const tx = smoothstep(gridX - integerX);

      const g00 = grid[integerY * gridWidth + integerX];
      const g10 = grid[integerY * gridWidth + integerX + 1];
      const g01 = grid[(integerY + 1) * gridWidth + integerX];
      const g11 = grid[(integerY + 1) * gridWidth + integerX + 1];

      const a = lerp(g00, g10, tx);
      const b = lerp(g01, g11, tx);
      output[y * width + x] = lerp(a, b, ty);
    }
  }

  return output;
}

function makeValueNoise1D(width: number, cell: number) {
  const gridWidth = Math.ceil(width / cell) + 3;
  const grid = new Float32Array(gridWidth);

  for (let index = 0; index < gridWidth; index += 1) {
    grid[index] = Math.random() * 2 - 1;
  }

  const output = new Float32Array(width);

  for (let x = 0; x < width; x += 1) {
    const gridX = x / cell;
    const integerX = Math.floor(gridX);
    const tx = smoothstep(gridX - integerX);
    output[x] = lerp(grid[integerX], grid[integerX + 1], tx);
  }

  return output;
}

export function makeBurnAnimator(
  sourceCanvas: HTMLCanvasElement,
  targetCanvas: HTMLCanvasElement,
): BurnAnimator {
  const nullableTargetCtx = targetCanvas.getContext('2d', {
    alpha: true,
    desynchronized: true,
  });
  const sourceCtx = sourceCanvas.getContext('2d', { alpha: true });

  if (!nullableTargetCtx || !sourceCtx) {
    return {
      start: () => Promise.resolve(),
      cancel: () => undefined,
    };
  }

  const targetCtx = nullableTargetCtx;
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const sourceImageData = sourceCtx.getImageData(0, 0, width, height);
  const sourcePixels = sourceImageData.data;
  const frameImageData = targetCtx.createImageData(width, height);
  const framePixels = frameImageData.data;
  const assets = getBurnAssets();
  const frontierMap = new Float32Array(width);

  let progress = 0;
  let burning = true;
  let done = false;
  let lastTime = 0;
  let floatT = 0;
  let profile: BurnProfile;
  let cancelled = false;
  let frameId = 0;
  let resolveRun: (() => void) | null = null;
  let noiseCombined = new Float32Array(width * height);
  let columnNoiseA = new Float32Array(width);
  let columnNoiseB = new Float32Array(width);

  const embers: EmberParticle[] = [];
  const smoke: SmokeParticle[] = [];

  function buildProfile() {
    profile = {
      cellLarge: rand(46, 70),
      cellMain: rand(22, 38),
      cellDetail: rand(8, 16),
      columnCellA: rand(18, 34),
      columnCellB: rand(42, 76),
      largeAmp: rand(18, 34),
      mainAmp: rand(10, 20),
      detailAmp: rand(4, 11),
      edgeAmpA: rand(5, 18),
      edgeAmpB: rand(3, 12),
      edgeAmpC: rand(2, 8),
      freqA: rand(0.03, 0.085),
      freqB: rand(0.01, 0.032),
      freqC: rand(0.09, 0.22),
      speedA: rand(0.003, 0.008),
      speedB: rand(0.0016, 0.0048),
      speedC: rand(0.008, 0.02),
      phaseA: rand(0, Math.PI * 2),
      phaseB: rand(0, Math.PI * 2),
      phaseC: rand(0, Math.PI * 2),
      columnAmpA: rand(12, 28),
      columnAmpB: rand(8, 18),
      slant: rand(-0.18, 0.18),
      bow: rand(-20, 20),
      glowBand: rand(14, 22),
      charBand: rand(28, 42),
      emberBurst: rand(0.85, 1.35),
      flameBoost: rand(0.9, 1.35),
    };

    const noiseLarge = makeValueNoise2D(width, height, profile.cellLarge);
    const noiseMain = makeValueNoise2D(width, height, profile.cellMain);
    const noiseDetail = makeValueNoise2D(width, height, profile.cellDetail);
    noiseCombined = new Float32Array(width * height);

    for (let index = 0; index < noiseCombined.length; index += 1) {
      noiseCombined[index] =
        noiseLarge[index] * profile.largeAmp +
        noiseMain[index] * profile.mainAmp +
        noiseDetail[index] * profile.detailAmp;
    }

    columnNoiseA = makeValueNoise1D(width, profile.columnCellA);
    columnNoiseB = makeValueNoise1D(width, profile.columnCellB);
  }

  function getFrontierY(x: number) {
    const nx = x / (width - 1);
    const center = nx - 0.5;
    const base = height + 44 - progress * (height + 92);
    const slant = center * profile.slant * height;
    const bow = profile.bow * (1 - Math.abs(center) * 2);
    const wobbleA =
      Math.sin(floatT * profile.speedA + x * profile.freqA + profile.phaseA) *
      profile.edgeAmpA;
    const wobbleB =
      Math.sin(floatT * profile.speedB + x * profile.freqB + profile.phaseB) *
      profile.edgeAmpB;
    const wobbleC =
      Math.sin(floatT * profile.speedC + x * profile.freqC + profile.phaseC) *
      profile.edgeAmpC;
    const noiseWiggle =
      columnNoiseA[x] * profile.columnAmpA +
      columnNoiseB[x] * profile.columnAmpB;

    return base + slant + bow + wobbleA + wobbleB + wobbleC + noiseWiggle;
  }

  function updateFrontierMap() {
    for (let x = 0; x < width; x += 1) {
      frontierMap[x] = getFrontierY(x);
    }
  }

  function spawnParticles() {
    if (!burning || done) return;

    const count = Math.max(
      3,
      Math.round((4 + progress * 5) * profile.emberBurst),
    );

    for (let index = 0; index < count; index += 1) {
      const x = Math.random() * width;
      const y = frontierMap[x | 0];

      if (y < -15 || y > height + 10) continue;

      const life = 20 + Math.random() * 24;
      embers.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 4,
        vx: (Math.random() - 0.5) * 0.75,
        vy: -0.8 - Math.random() * 2.3,
        size: 1 + Math.random() * 2.2,
        life,
        maxLife: life,
        glow: Math.random() * 0.6 + 0.4,
      });

      if (Math.random() < 0.14) {
        const smokeLife = 24 + Math.random() * 30;
        smoke.push({
          x: x + (Math.random() - 0.5) * 8,
          y: y - 2,
          vx: (Math.random() - 0.5) * 0.28,
          vy: -0.15 - Math.random() * 0.45,
          size: 7 + Math.random() * 8,
          grow: 0.1 + Math.random() * 0.15,
          life: smokeLife,
          maxLife: smokeLife,
        });
      }
    }
  }

  function updateParticles(delta: number) {
    const step = delta * 0.06;

    for (let index = embers.length - 1; index >= 0; index -= 1) {
      const particle = embers[index];
      particle.x += particle.vx * step;
      particle.y += particle.vy * step;
      particle.vy += 0.01 * step;
      particle.life -= step;
      if (particle.life <= 0) embers.splice(index, 1);
    }

    for (let index = smoke.length - 1; index >= 0; index -= 1) {
      const particle = smoke[index];
      particle.x += particle.vx * step;
      particle.y += particle.vy * step;
      particle.size += particle.grow * step;
      particle.life -= step;
      if (particle.life <= 0) smoke.splice(index, 1);
    }
  }

  function drawSmoke() {
    targetCtx.save();
    targetCtx.globalCompositeOperation = 'source-over';

    smoke.forEach((particle) => {
      const alpha = clampNumber(particle.life / particle.maxLife, 0, 1) * 0.7;
      const diameter = particle.size * 2;
      targetCtx.globalAlpha = alpha;
      targetCtx.drawImage(
        assets.smoke,
        particle.x - particle.size,
        particle.y - particle.size,
        diameter,
        diameter,
      );
    });

    targetCtx.restore();
    targetCtx.globalAlpha = 1;
  }

  function drawEmbers() {
    targetCtx.save();
    targetCtx.globalCompositeOperation = 'screen';

    embers.forEach((particle) => {
      const life = clampNumber(particle.life / particle.maxLife, 0, 1);
      const glow = particle.size * (2.2 + particle.glow * 1.5);
      const diameter = glow * 2;

      targetCtx.globalAlpha = life * 0.95;
      targetCtx.drawImage(
        assets.ember,
        particle.x - glow,
        particle.y - glow,
        diameter,
        diameter,
      );

      targetCtx.globalAlpha = life * 0.85;
      targetCtx.fillStyle = 'rgba(255,245,220,1)';
      targetCtx.beginPath();
      targetCtx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      targetCtx.fill();
    });

    targetCtx.restore();
    targetCtx.globalAlpha = 1;
  }

  function drawFlameFront() {
    if (progress <= 0 || done) return;

    const points: Array<[number, number]> = [];
    for (let x = 0; x <= width; x += 8) {
      points.push([x, frontierMap[Math.min(width - 1, x)]]);
    }

    targetCtx.save();
    targetCtx.globalCompositeOperation = 'screen';

    targetCtx.beginPath();
    targetCtx.moveTo(points[0][0], points[0][1]);
    points.slice(1).forEach((point) => {
      targetCtx.lineTo(point[0], point[1]);
    });

    targetCtx.lineWidth = 16;
    targetCtx.strokeStyle = 'rgba(255, 94, 26, 0.14)';
    targetCtx.shadowBlur = 18;
    targetCtx.shadowColor = 'rgba(255, 94, 26, 0.34)';
    targetCtx.stroke();

    targetCtx.beginPath();
    targetCtx.moveTo(points[0][0], points[0][1]);
    points.slice(1).forEach((point) => {
      targetCtx.lineTo(point[0], point[1]);
    });

    targetCtx.lineWidth = 6;
    targetCtx.strokeStyle = 'rgba(255, 182, 73, 0.38)';
    targetCtx.shadowBlur = 10;
    targetCtx.shadowColor = 'rgba(255, 174, 51, 0.28)';
    targetCtx.stroke();
    targetCtx.shadowBlur = 0;

    for (let x = 0; x < width; x += 24) {
      const y = frontierMap[x];
      if (y < -20 || y > height + 10) continue;

      const flameHeight =
        (8 +
          (Math.sin(floatT * 0.02 + x * 0.31 + profile.phaseA) * 0.5 + 0.5) *
            12 +
          progress * 8) *
        profile.flameBoost;
      const flameWidth =
        5 +
        (Math.sin(floatT * 0.017 + x * 0.12 + profile.phaseB) * 0.5 + 0.5) * 4;

      targetCtx.fillStyle = 'rgba(255, 128, 46, 0.34)';
      targetCtx.beginPath();
      targetCtx.moveTo(x - flameWidth, y + 2);
      targetCtx.quadraticCurveTo(
        x - flameWidth * 0.2,
        y - flameHeight * 0.6,
        x,
        y - flameHeight,
      );
      targetCtx.quadraticCurveTo(
        x + flameWidth * 0.2,
        y - flameHeight * 0.55,
        x + flameWidth,
        y + 2,
      );
      targetCtx.closePath();
      targetCtx.fill();

      targetCtx.fillStyle = 'rgba(255, 214, 120, 0.22)';
      targetCtx.beginPath();
      targetCtx.moveTo(x - flameWidth * 0.45, y + 1);
      targetCtx.quadraticCurveTo(
        x - flameWidth * 0.1,
        y - flameHeight * 0.48,
        x,
        y - flameHeight * 0.72,
      );
      targetCtx.quadraticCurveTo(
        x + flameWidth * 0.1,
        y - flameHeight * 0.46,
        x + flameWidth * 0.45,
        y + 1,
      );
      targetCtx.closePath();
      targetCtx.fill();
    }

    targetCtx.restore();
  }

  function renderBurnFrame() {
    framePixels.fill(0);

    for (let y = 0; y < height; y += 1) {
      const row = y * width;

      for (let x = 0; x < width; x += 1) {
        const pixelIndex = row + x;
        const pixelOffset = pixelIndex * 4;
        const alpha = sourcePixels[pixelOffset + 3];

        if (alpha === 0) continue;

        const field = y - frontierMap[x] + noiseCombined[pixelIndex];
        if (field > 0) continue;

        let red = sourcePixels[pixelOffset];
        let green = sourcePixels[pixelOffset + 1];
        let blue = sourcePixels[pixelOffset + 2];
        let alphaChannel = alpha;

        if (field > -profile.glowBand) {
          const edge = 1 - clampNumber(-field / profile.glowBand, 0, 1);
          const glow = edge ** 0.85;

          red = red * (1 - glow * 0.82) + 255 * glow * 0.95;
          green = green * (1 - glow * 0.88) + 138 * glow * 0.55;
          blue = blue * (1 - glow * 0.95) + 34 * glow * 0.18;
          alphaChannel = alphaChannel * (1 - glow * 0.15);
        } else if (field > -profile.charBand) {
          const charAmount =
            1 -
            clampNumber(
              (-field - profile.glowBand) /
                (profile.charBand - profile.glowBand),
              0,
              1,
            );
          red *= 1 - charAmount * 0.18;
          green *= 1 - charAmount * 0.22;
          blue *= 1 - charAmount * 0.28;
        }

        framePixels[pixelOffset] = red;
        framePixels[pixelOffset + 1] = green;
        framePixels[pixelOffset + 2] = blue;
        framePixels[pixelOffset + 3] = alphaChannel;
      }
    }

    targetCtx.clearRect(0, 0, width, height);
    targetCtx.putImageData(frameImageData, 0, 0);
  }

  return {
    start() {
      if (cancelled) return Promise.resolve();
      buildProfile();

      return new Promise<void>((resolve) => {
        resolveRun = resolve;
        const loop = (now: number) => {
          if (cancelled) {
            targetCtx.clearRect(0, 0, width, height);
            resolveRun?.();
            resolveRun = null;
            return;
          }
          const delta = Math.min(32, now - lastTime || 16.67);
          lastTime = now;
          floatT += delta;

          if (burning && !done) {
            progress += delta * 0.00142;

            if (progress >= 1.08) {
              progress = 1.08;
              burning = false;
              done = true;
            }
          }

          updateFrontierMap();
          spawnParticles();
          updateParticles(delta);
          renderBurnFrame();
          drawSmoke();
          drawFlameFront();
          drawEmbers();

          if (burning || embers.length > 0 || smoke.length > 0) {
            frameId = requestAnimationFrame(loop);
            return;
          }

          targetCtx.clearRect(0, 0, width, height);
          resolveRun?.();
          resolveRun = null;
        };

        lastTime = performance.now();
        frameId = requestAnimationFrame(loop);
      });
    },
    cancel() {
      cancelled = true;
      cancelAnimationFrame(frameId);
      targetCtx.clearRect(0, 0, width, height);
      resolveRun?.();
      resolveRun = null;
    },
  };
}
