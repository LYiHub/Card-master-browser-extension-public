const PLAYER_HOST = 'player.bilibili.com';
const BLOCKED_HOSTS = new Set([
  'live.bilibili.com',
  'space.bilibili.com',
  'message.bilibili.com',
  'search.bilibili.com',
  'account.bilibili.com',
  'member.bilibili.com',
  'passport.bilibili.com',
]);
const PLAYER_PATH_PREFIXES = [
  '/video/',
  '/bangumi/',
  '/list/',
  '/medialist/',
  '/watchlater',
] as const;

export function bilibiliSponsorPage(url: string) {
  try {
    const page = new URL(url);
    if (page.protocol !== 'https:') return false;
    const host = page.hostname.toLowerCase();
    if (host !== 'bilibili.com' && !host.endsWith('.bilibili.com'))
      return false;
    if (BLOCKED_HOSTS.has(host)) return false;
    if (host === PLAYER_HOST) return true;
    const path = page.pathname;
    return (
      path === '/blackboard/newplayer.html' ||
      PLAYER_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))
    );
  } catch {
    return false;
  }
}
