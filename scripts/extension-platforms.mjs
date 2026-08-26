export const DEFAULT_EXTENSION_PLATFORM = 'chromium';

export const EXTENSION_PLATFORMS = Object.freeze([
  'chromium',
  'firefox',
  'safari',
  'all',
]);

export const EXTENSION_PLATFORM_USAGE =
  '--platform=chromium|firefox|safari|all';

export function parseExtensionPlatform(args) {
  let platform = DEFAULT_EXTENSION_PLATFORM;
  let platformSpecified = false;
  const positional = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--platform') {
      if (platformSpecified) throw new Error('平台参数只能指定一次。');
      platform = args[index + 1] ?? '';
      platformSpecified = true;
      index += 1;
      continue;
    }
    if (argument.startsWith('--platform=')) {
      if (platformSpecified) throw new Error('平台参数只能指定一次。');
      platform = argument.slice('--platform='.length);
      platformSpecified = true;
      continue;
    }
    if (argument.startsWith('--')) {
      throw new Error(`未知参数：${argument}`);
    }
    positional.push(argument);
  }

  if (!EXTENSION_PLATFORMS.includes(platform)) {
    throw new Error(`不支持的扩展平台：${platform || '空值'}`);
  }

  return { platform, positional };
}
