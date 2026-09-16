import type { SyncService } from '../../sync/service';
import type { ExtensionBackgroundApi } from './api';

export const SYNC_ALARM = 'card-master.sync';
export const SYNC_CHANGE_ALARM = 'card-master.sync.changed';
const CONFIG_KEYS = new Set([
  'card-master.library.v1',
  'card-master.settings.v1',
  'card-master.deck-entry-settings.v1',
  'card-master.audio-settings.v1',
  'card-master.ai-services.v1',
  'card-master.new-tab.preferences.v1',
  'content-blocking.state.v1',
  'content-blocking.user-rules.v1',
  'page-theme.settings.v1',
  'media-speed.settings.v1',
  'media-resources.settings.v1',
  'card-master.gamepad-control.v1',
  'bilibili-capabilities.settings.v1',
]);

export function installSyncScheduling(
  api: ExtensionBackgroundApi,
  service: SyncService,
  initialize: () => Promise<void>,
) {
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' && area !== 'sync') return;
    if (
      !Object.keys(changes).some(
        (key) =>
          CONFIG_KEYS.has(key) ||
          key.startsWith('_x_extension_') ||
          key.startsWith('card-master.cat-catch.') ||
          key.startsWith('sponsor-runtime.'),
      )
    )
      return;
    void service
      .request({ type: 'read' })
      .then((state) => {
        if (state.connected)
          return api.alarms.create(SYNC_CHANGE_ALARM, { delayInMinutes: 1 });
      })
      .catch(() => undefined);
  });
  api.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== SYNC_CHANGE_ALARM) return;
    void initialize()
      .then(() => service.request({ type: 'run' }))
      .catch(() => undefined);
  });
}
