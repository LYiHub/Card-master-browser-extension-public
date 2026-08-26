import { installSponsorRuntimeAdapter } from './sponsor-runtime-adapter';

installSponsorRuntimeAdapter({
  runtimeId: 'bilibili',
  assetRoot: 'vendor/bilibili/sponsor',
  localePrefix: 'sponsor_bilibili_',
  pageHosts: ['bilibili.com'],
});
