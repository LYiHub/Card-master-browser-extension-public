export const MEDIA_SPEED_PROJECTILE_FRAME = {
  width: 640,
  height: 360,
} as const;

export const MEDIA_SPEED_BORDER_FRAME = {
  width: 512,
  height: 400,
  framesPerSecond: 24,
} as const;

export const MEDIA_SPEED_PROJECTILE_SEQUENCES = [
  {
    id: '01',
    frameCount: 35,
    contentLeft: 165,
    dominantColor: '#0e208d',
    dominantHue: 231.8,
  },
  {
    id: '03',
    frameCount: 33,
    contentLeft: 85,
    dominantColor: '#c07d11',
    dominantHue: 36.9,
  },
  {
    id: '04',
    frameCount: 32,
    contentLeft: 144,
    dominantColor: '#263cbc',
    dominantHue: 231.8,
  },
  {
    id: '08',
    frameCount: 28,
    contentLeft: 172,
    dominantColor: '#65d5c5',
    dominantHue: 171.8,
  },
  {
    id: '09',
    frameCount: 30,
    contentLeft: 209,
    dominantColor: '#c95207',
    dominantHue: 22.8,
  },
] as const;

export const MEDIA_SPEED_BORDER_SEQUENCES = [
  {
    id: '01',
    sourceName: 'tongque',
    frameCount: 25,
    dominantColor: '#0366ff',
    dominantHue: 216.4,
  },
] as const;
