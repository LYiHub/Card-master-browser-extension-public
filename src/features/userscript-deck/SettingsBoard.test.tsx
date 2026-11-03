import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import type { DataManagementController } from '../../data-management/domain/types';
import { setLanguagePreference } from '../../localization/locale';
import type { ScriptRepository } from '../../userscript/application/script-repository';
import type { UserscriptSettingsController } from '../../userscript/application/settings';
import type { DeckEntryController } from './deck-entry';
import { SettingsBoard } from './SettingsBoard';

function renderSettings(autoHideInFullscreen: boolean) {
  return renderToStaticMarkup(
    <SettingsBoard
      repository={{} as ScriptRepository}
      userscriptSettings={{} as UserscriptSettingsController}
      dataManagement={{} as DataManagementController}
      deckEntry={
        {
          shortcutSettingsAvailable: () => false,
        } as DeckEntryController
      }
      deckEntrySettings={{
        showDeckTrigger: true,
        showToolbarBadge: true,
        showDeckTriggerBadge: true,
        autoHideInFullscreen,
        position: null,
        hiddenCardIds: [],
      }}
      onDeckEntrySettingsChange={async () => undefined}
      onClose={() => undefined}
    />,
  );
}

afterEach(() => setLanguagePreference('auto'));

describe('SettingsBoard', () => {
  it.each([
    true,
    false,
  ])('renders fullscreen auto-hide %s in general settings', (autoHideInFullscreen) => {
    const markup = renderSettings(autoHideInFullscreen);

    expect(markup).not.toContain('打开新标签页设置');
    expect(markup).not.toContain('界面外观');
    expect(markup).not.toContain('跟随系统');
    expect(markup).toContain('显示页面牌库入口');
    expect(markup).toContain('全屏时自动隐藏浮动入口');
    expect(markup).toMatch(
      new RegExp(
        `全屏时自动隐藏浮动入口</strong>[^<]*(?:<small>[^<]*</small>)?</span><input[^>]*aria-checked="${autoHideInFullscreen}"`,
      ),
    );
    expect(markup).toContain('网页与新标签页显示可拖动的卡牌大师 Logo');
    expect(markup).not.toContain('显示右下角卡牌入口');
    expect(markup).toContain('扩展栏显示激活卡牌数量');
    expect(markup).toContain('页面入口显示激活卡牌数量');
    expect(markup).not.toContain('牌阵快捷键');
  });

  it('uses an uninterruptible loader instead of footer status during import', () => {
    const settingsSource = readFileSync(
      new URL('./SettingsBoard.tsx', import.meta.url),
      'utf8',
    );
    const detailSource = readFileSync(
      new URL('./DetailStage.tsx', import.meta.url),
      'utf8',
    );

    expect(settingsSource).toContain("const importing = busy === 'import'");
    expect(settingsSource).toContain(
      "<UiLoader large label={status || t('cm_settings_board_text_100')} />",
    );
    expect(settingsSource).toContain('data-dialog-close-blocked="true"');
    expect(settingsSource).toContain('if (importing) return');
    expect(settingsSource).not.toContain('LIBRARY_IMPORT_TIMEOUT_MS');
    expect(settingsSource).not.toContain('withTimeout(');
    expect(detailSource).toContain(
      'stage.querySelector(\'[data-dialog-close-blocked="true"]\')',
    );
  });

  it('keeps the reset-all confirm button clickable without a type-in gate', () => {
    const settingsSource = readFileSync(
      new URL('./SettingsBoard.tsx', import.meta.url),
      'utf8',
    );

    expect(settingsSource).not.toContain('confirmationReady');
    expect(settingsSource).not.toContain('confirmationText');
    expect(settingsSource).not.toContain('输入“全部清空”以继续');
    expect(settingsSource).toContain("t('cm_settings_board_button_label_45')");
    expect(settingsSource).toContain('disabled={busy !== null}');
  });

  it('uses the shared loader for asynchronous card settings operations', () => {
    for (const filename of [
      'BilibiliCapabilitySettingsBoard.tsx',
      'MediaSpeedSettingsBoard.tsx',
      'PageThemeSettingsBoard.tsx',
    ]) {
      const source = readFileSync(
        new URL(`./${filename}`, import.meta.url),
        'utf8',
      );

      expect(source).toContain('<UiLoader');
      expect(source).toContain('manager-settings-operation-loader');
      expect(source).not.toContain("busy ? '正在同步");
    }

    const gamepadSource = readFileSync(
      new URL('../gamepad-control/GamepadSettingsDialog.tsx', import.meta.url),
      'utf8',
    );
    expect(gamepadSource).toContain('<UiLoader');
    expect(gamepadSource).toContain('manager-settings-operation-loader');
    expect(gamepadSource).not.toContain("busy ? '正在同步");
  });
  it('renders Taiwanese terminology and can return to simplified Chinese', () => {
    setLanguagePreference('zh-TW');
    const markup = renderSettings(true);
    expect(markup).toContain('介面語言');
    expect(markup).toContain('全螢幕時自動隱藏浮動入口');
    expect(markup).toContain('顯示頁面牌庫入口');
    expect(markup).not.toContain('显示页面牌库入口');
    setLanguagePreference('zh-CN');
    expect(renderSettings(true)).toContain('全屏时自动隐藏浮动入口');
  });
});
