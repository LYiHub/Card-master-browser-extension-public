import type { MicrophonePermissionState } from '../../ai/domain/assistant-readiness';
import {
  microphonePermissionErrorMessage,
  readMicrophonePermissionState,
} from '../../ai/infrastructure/microphone-permission';
import cursorThemeStyles from '../../components/ui/theme.css?inline';
import { initializeExtensionDocument } from '../../localization/document';
import { t } from '../../localization/messages';
import { requireExtensionApi } from './api';
import { CARD_MASTER_DEFAULT_ICON_PATH } from './extension-branding';
import { microphoneSettingsUrl } from './platform';

async function bootstrap() {
  const styles = `
  :root {
    --permission-canvas: var(--app-ui-canvas);
    --permission-grid: color-mix(in srgb, var(--app-ui-accent) 5%, transparent);
    --permission-surface: var(--app-ui-surface-strong);
    --permission-ink: var(--app-ui-ink);
    --permission-muted: var(--app-ui-muted);
    --permission-accent: var(--app-ui-accent-hover);
    --permission-border: var(--app-ui-border-strong);
    --permission-button: var(--app-ui-accent-soft);
    --permission-shadow: var(--app-ui-shadow-modal);
    color-scheme: dark;
  }

  * {
    box-sizing: border-box;
  }

  body {
    min-width: 320px;
    min-height: 100vh;
    margin: 0;
    display: grid;
    place-items: center;
    padding: 24px;
    background:
      linear-gradient(var(--permission-grid) 1px, transparent 1px),
      linear-gradient(90deg, var(--permission-grid) 1px, transparent 1px),
      var(--permission-canvas);
    background-size: 28px 28px;
  }

  .permission-panel {
    width: min(520px, 100%);
    padding: 28px;
    border: 1px solid var(--permission-border);
    border-radius: 6px;
    background: var(--permission-surface);
    box-shadow: 0 24px 80px var(--permission-shadow);
  }

  .permission-brand {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 22px;
  }

  .permission-brand img {
    width: 52px;
    height: 52px;
    object-fit: contain;
  }

  .permission-brand p,
  .permission-copy,
  .permission-message {
    margin: 0;
  }

  .permission-brand p {
    color: var(--permission-accent);
    font-size: 12px;
    font-weight: 700;
  }

  h1 {
    margin: 3px 0 0;
    font-family: var(--app-ui-font-display);
    font-size: 24px;
    font-weight: 800;
    letter-spacing: 0;
  }

  .permission-copy {
    color: var(--permission-muted);
    font-size: 14px;
    line-height: 1.7;
  }

  .permission-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    margin: 22px 0;
    padding: 13px 14px;
    border-block: 1px solid var(--permission-border);
  }

  .permission-status span:first-child {
    color: var(--permission-muted);
    font-size: 13px;
  }

  .permission-status strong {
    color: var(--permission-accent);
    font-size: 13px;
  }

  .permission-status[data-state="granted"] strong {
    color: #80c99a;
  }

  .permission-status[data-state="denied"] strong,
  .permission-message.is-error {
    color: #ee877c;
  }

  .permission-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 10px;
  }

  button {
    min-height: 38px;
    padding: 0 16px;
    border: 1px solid var(--permission-border);
    border-radius: 4px;
    background: var(--permission-button);
    color: var(--permission-ink);
    font: inherit;
    font-size: 13px;
    font-weight: 700;
    cursor: var(--app-ui-cursor-pointer);
  }

  button:hover {
    border-color: #d8ba70;
    background: rgba(204, 166, 91, 0.15);
  }

  button.primary {
    border-color: #d4b365;
    background: #caa756;
    color: #17130c;
  }

  button:disabled {
    cursor: var(--app-ui-cursor-wait);
    opacity: 0.55;
  }

  .permission-message {
    min-height: 22px;
    margin-top: 16px;
    color: #9ed0ab;
    font-size: 13px;
    line-height: 1.6;
  }
`;

  const style = document.createElement('style');
  style.textContent = `${cursorThemeStyles}\n${styles}`;
  document.head.append(style);
  document.documentElement.classList.add('app-ui-theme');

  const api = requireExtensionApi();
  await initializeExtensionDocument(api, () => t('cm_document_microphone'));

  const rootElement = document.getElementById('microphone-permission-root');
  if (!rootElement) throw new Error(t('cm_microphone_permission_error_1'));
  const root = rootElement;

  root.innerHTML = t('cm_microphone_permission_text_7', [
    String(CARD_MASTER_DEFAULT_ICON_PATH),
  ]);

  function element<T extends Element>(selector: string) {
    const target = root.querySelector<T>(selector);
    if (!target)
      throw new Error(
        t('cm_microphone_permission_error_8', [String(selector)]),
      );
    return target;
  }

  const status = element<HTMLElement>('.permission-status');
  const statusValue = element<HTMLElement>('.permission-status strong');
  const message = element<HTMLElement>('.permission-message');
  const requestButton = element<HTMLButtonElement>('[data-action="request"]');
  const closeButton = element<HTMLButtonElement>('[data-action="close"]');
  const settingsButton = element<HTMLButtonElement>(
    '[data-action="browser-settings"]',
  );

  function renderState(state: MicrophonePermissionState) {
    status.dataset.state = state;
    statusValue.textContent =
      state === 'granted'
        ? t('cm_microphone_permission_text_9')
        : state === 'denied'
          ? t('cm_microphone_permission_text_10')
          : state === 'prompt'
            ? t('cm_microphone_permission_text_11')
            : t('cm_microphone_permission_text_12');
    requestButton.textContent =
      state === 'granted'
        ? t('cm_microphone_permission_text_13')
        : t('cm_microphone_permission_text_14');
    closeButton.hidden = state !== 'granted';
  }

  async function refresh() {
    renderState(await readMicrophonePermissionState());
  }

  requestButton.addEventListener('click', () => {
    requestButton.disabled = true;
    message.classList.remove('is-error');
    message.textContent = t('cm_microphone_permission_text_15');
    void navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(async (stream) => {
        for (const track of stream.getTracks()) track.stop();
        await refresh();
        message.textContent = t('cm_microphone_permission_text_16');
      })
      .catch((error) => {
        message.classList.add('is-error');
        message.textContent = t('cm_microphone_permission_text_17', [
          String(microphonePermissionErrorMessage(error)),
        ]);
        void refresh();
      })
      .finally(() => {
        requestButton.disabled = false;
      });
  });

  settingsButton.addEventListener('click', () => {
    const url = microphoneSettingsUrl();
    if (!url) {
      message.classList.add('is-error');
      message.textContent = t('cm_microphone_permission_text_18');
      return;
    }
    void api.tabs?.create({ url });
  });

  closeButton.addEventListener('click', () => window.close());

  void refresh();
}
void bootstrap().catch(console.error);
