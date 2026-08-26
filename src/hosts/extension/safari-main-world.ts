export const SAFARI_MAIN_WORLD_INJECTION_REQUEST =
  'safari-main-world-injection-request';

const SHARED_SCRIPTS = ['theme-proxy.js', 'media-speed-proxy.js'] as const;
const BILIBILI_FRAME_SCRIPTS = [
  'vendor/bilibili/sponsor/js/document.js',
] as const;
const BILIBILI_TOP_FRAME_SCRIPTS = [
  'bilibili-recommendation-proxy.js',
] as const;
const YOUTUBE_FRAME_SCRIPTS = [
  'vendor/youtube/sponsor/js/document.js',
] as const;

export function safariMainWorldScripts(url: string, topFrame: boolean) {
  let hostname: string;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return [...SHARED_SCRIPTS];
  }
  if (hostname === 'bilibili.com' || hostname.endsWith('.bilibili.com')) {
    return [
      ...SHARED_SCRIPTS,
      ...BILIBILI_FRAME_SCRIPTS,
      ...(topFrame ? BILIBILI_TOP_FRAME_SCRIPTS : []),
    ];
  }
  if (
    hostname === 'youtube.com' ||
    hostname.endsWith('.youtube.com') ||
    hostname === 'youtube-nocookie.com' ||
    hostname.endsWith('.youtube-nocookie.com')
  ) {
    return [...SHARED_SCRIPTS, ...YOUTUBE_FRAME_SCRIPTS];
  }
  return [...SHARED_SCRIPTS];
}
