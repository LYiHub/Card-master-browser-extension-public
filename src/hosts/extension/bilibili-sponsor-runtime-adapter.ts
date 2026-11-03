import simplified from '../../../vendor/bilibili/sponsor/_locales/zh_CN/messages.json';
import traditional from '../../locales/vendor/bilibili/zh_TW/messages.json';
import { installSponsorRuntimeAdapter } from './sponsor-runtime-adapter';
import { localizedVendorMessages } from './vendor-messages';

installSponsorRuntimeAdapter({
  messages: localizedVendorMessages(simplified, traditional),
  runtimeId: 'bilibili',
  assetRoot: 'vendor/bilibili/sponsor',
  localePrefix: 'sponsor_bilibili_',
  pageHosts: ['bilibili.com'],
});
