import { createRoot } from 'react-dom/client';
import {
  NewTabSettingsPage,
  newTabSettingsCapabilities,
} from '../../features/new-tab/NewTabSettingsPage';
import foundationStyles from '../../features/new-tab/new-tab-foundation.css?inline';
import settingsStyles from '../../features/new-tab/new-tab-settings.css?inline';
import { t } from '../../localization/messages';
import { NewTabLocalWallpaperRepository } from '../../new-tab/application/local-wallpaper';
import { NewTabPreferencesRepository } from '../../new-tab/application/preferences';
import { requireExtensionApi } from './api';
import { ExtensionDailyReviewWallpaperSettingsController } from './daily-review-wallpaper-settings';
import { reportExtensionFailure } from './diagnostics';
import { extensionOverridesNewTab } from './extension-runtime-api';
import { extensionTarget } from './platform';

try {
  const api = requireExtensionApi();
  const root = document.getElementById('new-tab-settings-root');
  if (!root) throw new Error(t('cm_new_tab_settings_error_1'));
  createRoot(root).render(
    <>
      <style>{foundationStyles}</style>
      <style>{settingsStyles}</style>
      <NewTabSettingsPage
        assetUrl={(path) => api.runtime.getURL(path)}
        backUrl={api.runtime.getURL('new-tab.html')}
        capabilities={newTabSettingsCapabilities(extensionTarget())}
        overridesBrowserNewTab={extensionOverridesNewTab()}
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
        ? t('cm_new_tab_settings_text_2', [String(error.message)])
        : t('cm_new_tab_settings_text_3');
    root.dataset.error = 'true';
  }
}
