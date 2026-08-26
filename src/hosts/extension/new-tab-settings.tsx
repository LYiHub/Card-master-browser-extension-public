import { createRoot } from 'react-dom/client';

import {
  NewTabSettingsPage,
  newTabSettingsCapabilities,
} from '../../features/new-tab/NewTabSettingsPage';
import foundationStyles from '../../features/new-tab/new-tab-foundation.css?inline';
import settingsStyles from '../../features/new-tab/new-tab-settings.css?inline';
import { NewTabLocalWallpaperRepository } from '../../new-tab/application/local-wallpaper';
import { NewTabPreferencesRepository } from '../../new-tab/application/preferences';
import { requireExtensionApi } from './api';
import { ExtensionDailyReviewWallpaperSettingsController } from './daily-review-wallpaper-settings';
import { reportExtensionFailure } from './diagnostics';
import { extensionTarget } from './platform';

try {
  const api = requireExtensionApi();
  const root = document.getElementById('new-tab-settings-root');
  if (!root) throw new Error('新标签页设置缺少挂载节点。');
  createRoot(root).render(
    <>
      <style>{foundationStyles}</style>
      <style>{settingsStyles}</style>
      <NewTabSettingsPage
        assetUrl={(path) => api.runtime.getURL(path)}
        backUrl={api.runtime.getURL('new-tab.html')}
        capabilities={newTabSettingsCapabilities(extensionTarget())}
        dailyReviewController={
          new ExtensionDailyReviewWallpaperSettingsController(api)
        }
        dailyReviewSupported={extensionTarget() !== 'safari'}
        localWallpaperRepository={new NewTabLocalWallpaperRepository()}
        preferencesRepository={
          new NewTabPreferencesRepository(api.storage.local, api.storage.sync)
        }
      />
    </>,
  );
} catch (error) {
  reportExtensionFailure('new-tab-settings', 'bootstrap-failed', error);
  const root = document.getElementById('new-tab-settings-root');
  if (root) {
    root.textContent =
      error instanceof Error
        ? `新标签页设置启动失败：${error.message}`
        : '新标签页设置启动失败。';
    root.dataset.error = 'true';
  }
}
