import { installSponsorRuntimeAdapter } from './sponsor-runtime-adapter';

installSponsorRuntimeAdapter({
  runtimeId: 'youtube',
  assetRoot: 'vendor/youtube/sponsor',
  localePrefix: 'sponsor_youtube_',
  pageHosts: ['youtube.com', 'youtube-nocookie.com'],
  externalMessages: true,
});
