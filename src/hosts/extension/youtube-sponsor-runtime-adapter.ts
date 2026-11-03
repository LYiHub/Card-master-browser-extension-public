import simplified from '../../../vendor/youtube/sponsor/_locales/zh_CN/messages.json';
import traditional from '../../locales/vendor/youtube/zh_TW/messages.json';
import { installSponsorRuntimeAdapter } from './sponsor-runtime-adapter';
import { localizedVendorMessages } from './vendor-messages';

installSponsorRuntimeAdapter({
  messages: localizedVendorMessages(simplified, traditional),
  runtimeId: 'youtube',
  assetRoot: 'vendor/youtube/sponsor',
  localePrefix: 'sponsor_youtube_',
  pageHosts: ['youtube.com', 'youtube-nocookie.com'],
  externalMessages: true,
});
