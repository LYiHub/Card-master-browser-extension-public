import { describe, expect, it } from 'vitest';
import { defaultGamepadControlSettings } from '../../gamepad-control/domain/settings';
import { startingMediaResourcesSnapshot } from '../../media-resources/domain/types';
import { defaultMediaSpeedSettings } from '../../media-speed/domain/types';
import { defaultPageThemeSettings } from '../../page-theme/domain/types';
import { storedScript } from '../../userscript/application/script-repository';
import { INITIAL_USERSCRIPTS } from '../../userscript/fixtures';
import { assistantPortName } from './assistant-protocol';
import { assistantSurfaceLifecyclePortName } from './assistant-surface-path';
import {
  audioPlaybackRequest,
  EXTENSION_CHANNEL,
  extensionAudioSettingsEvent,
  extensionContentBlockingEvent,
  extensionContentBlockingUserRulesEvent,
  extensionLibraryEvent,
  extensionMediaResourcesPageSnapshotEvent,
  extensionMediaSpeedPageSnapshotEvent,
  extensionMediaSpeedStateEvent,
  extensionPageThemeEvent,
  extensionRequest,
  extensionRuntimeEvent,
  mainWorldCommandInvocation,
  mainWorldRuntimeMessage,
  OFFSCREEN_AUDIO_CHANNEL,
  offscreenAudioCommand,
  offscreenAudioPlaybackResult,
  parseUserScriptPortName,
  userScriptMessage,
  userScriptPortName,
} from './protocol';
import { sponsorRuntimePortName } from './sponsor-runtime';

describe('extension protocol guards', () => {
  it('validates every gamepad control settings request', () => {
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'gamepad-control-settings-read',
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'gamepad-control-settings-save',
        settings: defaultGamepadControlSettings(),
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'gamepad-control-indicator-set',
        visible: false,
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'gamepad-control-settings-save',
        settings: {},
      }),
    ).toBe(false);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'gamepad-control-indicator-set',
        visible: 'false',
      }),
    ).toBe(false);
  });

  it('accepts an explicit same-document URL for platform capability refreshes', () => {
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'bilibili-capabilities-read',
        pageUrl: 'https://www.youtube.com/watch?v=video-id',
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'bilibili-capabilities-read',
        pageUrl: '',
      }),
    ).toBe(false);
  });

  it('validates media resource requests and page snapshots', () => {
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'media-resources-read',
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'media-resources-set-enabled',
        enabled: false,
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'media-resources-settings-open',
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'media-resources-settings-update',
        presentation: {
          showPageTrigger: false,
          showResourceCountBadge: true,
        },
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'media-resources-inspect',
        resourceId: 'media-1',
        targetTabId: 7,
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'media-resources-download',
        resourceId: '',
        targetTabId: 7,
      }),
    ).toBe(false);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'media-resources-download-finish',
        requestId: 'download-1',
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'media-resources-download-finish',
        requestId: '',
      }),
    ).toBe(false);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'media-resources-capture-set',
        enabled: true,
      }),
    ).toBe(true);
    expect(
      extensionMediaResourcesPageSnapshotEvent({
        channel: EXTENSION_CHANNEL,
        type: 'media-resources-page-snapshot',
        snapshot: startingMediaResourcesSnapshot('https://example.com/'),
      }),
    ).toBe(true);
  });

  it('accepts known requests and runtime events', () => {
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'fetch-update',
        url: 'https://example.com/script.meta.js',
      }),
    ).toBe(true);
    expect(
      audioPlaybackRequest({
        channel: EXTENSION_CHANNEL,
        type: 'audio-playback-play',
        requestId: 'audio-1',
        cue: 'deckHover',
        options: {
          gain: 0.8,
          playbackRate: 1.05,
          pan: 0.4,
          sourceIndex: 3,
        },
        settings: { muted: false, volume: 0.78 },
      }),
    ).toBe(true);
    expect(
      offscreenAudioPlaybackResult({
        channel: OFFSCREEN_AUDIO_CHANNEL,
        type: 'audio-playback-result',
        requestId: 'audio-1',
        cue: 'deckHover',
        playback: { result: 'playing' },
      }),
    ).toBe(true);
    expect(
      offscreenAudioCommand({
        channel: OFFSCREEN_AUDIO_CHANNEL,
        type: 'audio-playback-prepare',
        cues: ['uiHover', 'deckHover'],
        settings: { muted: false, volume: 0.78 },
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'main-world-runtime',
        scriptId: 'script',
        capability: 'secret',
        message: {
          type: 'register-command',
          command: {
            id: 'command-1',
            title: 'Run',
            autoClose: true,
            order: 0,
          },
        },
      }),
    ).toBe(true);
    expect(
      mainWorldCommandInvocation({
        channel: EXTENSION_CHANNEL,
        type: 'main-world-command-invoke',
        scriptId: 'script',
        capability: 'secret',
        commandId: 'command-1',
        invocationId: 'invocation-1',
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'userscript-capability-read',
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'safari-userscript-runtime-run',
        runAt: 'document_start',
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'safari-main-world-injection-request',
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'userscript-installer-open',
        url: 'https://example.com/script.user.js',
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'userscript-install-preview',
        url: 'https://example.com/script.user.js',
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'userscript-install-confirm',
        sourceUrl: 'https://cdn.example.com/download/42',
        source: '// ==UserScript==',
        presentation: {
          accent: '#df9850',
          media: {
            kind: 'video',
            video: 'userscript-deck/video/userscript-cards/01.mp4',
          },
        },
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'get-page-context',
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'gamepad-browser-command',
        command: 'new-tab',
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'gamepad-browser-command',
        command: 'next-tab',
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'gamepad-browser-command',
        command: 'close-tab',
      }),
    ).toBe(false);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'ai-model-service-save',
        config: {
          baseUrl: 'https://router.example',
          model: 'gpt-5.5',
          protocol: 'responses',
          reasoningEffort: 'high',
        },
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'ai-image-service-save',
        config: {
          credentialSource: 'independent',
          protocol: 'openai-images',
          baseUrl: 'https://images.example/v1',
          model: 'custom-image-model',
        },
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'ai-model-service-save',
        config: {
          baseUrl: 'https://router.example',
          model: 'gpt-5.5',
          protocol: 'responses',
          reasoningEffort: 'high',
          obsoleteCredentials: true,
        },
      }),
    ).toBe(false);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'ai-model-service-credential-clear',
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'data-management-run',
        action: 'assistant-conversations',
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'data-management-run',
        action: 'reset-all',
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'data-management-run',
        action: 'all',
      }),
    ).toBe(false);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'data-management-run',
        action: 'unknown',
      }),
    ).toBe(false);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'ai-assistant-surface-open',
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'ai-assistant-surface-open',
        tab: 'settings',
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'ai-assistant-surface-open',
        tab: 'unknown',
      }),
    ).toBe(false);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'ai-assistant-surface-context-read',
        tabId: 7,
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'global-library-open',
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'site-script-search-open',
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'userscript-settings-write',
        settings: {
          reloadAfterScriptChange: false,
          updateIntervalDays: 1,
          updateEnabledOnly: true,
        },
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'userscript-cover-generate',
        prompt: '一个正在重排石板的奇幻工匠',
        injectDefaultStyle: true,
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'library-replace-all',
        scripts: INITIAL_USERSCRIPTS.slice(0, 2).map(storedScript),
      }),
    ).toBe(true);
    expect(
      extensionRuntimeEvent({
        channel: EXTENSION_CHANNEL,
        type: 'runtime-state',
        scriptId: 'script',
        state: {
          tabId: 1,
          frameId: 0,
          instanceId: 'instance',
          status: 'ready',
          commands: [],
          pendingRefresh: false,
        },
      }),
    ).toBe(true);
    expect(
      extensionLibraryEvent({
        channel: EXTENSION_CHANNEL,
        type: 'library-changed',
        orderedIds: [],
        scripts: [],
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'content-blocking-general-save',
        settings: {
          rulesEnabled: true,
          allowlist: ['example.org'],
        },
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'content-blocking-user-rules-read',
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'content-blocking-user-rules-replace',
        userRules: 'example.com##.ad',
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'content-blocking-static-filter-toggle',
        filterId: 4,
        enabled: true,
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'content-blocking-subscriptions-add',
        urls: ['https://filters.example/list.txt'],
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'content-blocking-user-rules-add',
        rules: ['example.com##.ad', 'example.com##.sponsor'],
        session: { sessionId: 'session-1', startedAt: 1 },
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'content-blocking-element-batch-undo',
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'content-blocking-current-site-set',
        pageUrl: 'https://example.com/',
        enabled: false,
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'content-blocking-configuration-export',
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'content-blocking-configuration-import',
        source: '{"kind":"card-master-content-blocking"}',
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'content-blocking-subscription-toggle',
        subscriptionId: 'filter',
        enabled: false,
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'content-blocking-subscriptions-auto-update',
        enabled: true,
      }),
    ).toBe(true);
    expect(
      extensionContentBlockingEvent({
        channel: EXTENSION_CHANNEL,
        type: 'content-blocking-changed',
        snapshot: {
          revision: 1,
          rulesEnabled: true,
          status: 'ready',
          configurationPending: false,
          loadedRuleCount: 12,
          activeRuleCount: 12,
          userRuleCount: 1,
          enabledSubscriptionCount: 1,
          subscriptionCount: 1,
          rejectedRuleCount: 0,
          allowlist: [],
          lastElementBlockingBatch: null,
          errors: [],
          limitations: [],
        },
      }),
    ).toBe(true);
    expect(
      extensionAudioSettingsEvent({
        channel: EXTENSION_CHANNEL,
        type: 'audio-settings-changed',
        settings: {
          muted: true,
          volume: 0.5,
        },
      }),
    ).toBe(true);
    expect(
      extensionContentBlockingUserRulesEvent({
        channel: EXTENSION_CHANNEL,
        type: 'content-blocking-user-rules-changed',
      }),
    ).toBe(true);
    const pageThemeSettings = defaultPageThemeSettings();
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'page-theme-settings-save',
        settings: pageThemeSettings,
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'page-theme-page-report',
        snapshot: {
          revision: pageThemeSettings.revision,
          status: 'ready',
          enabled: true,
          activeOnPage: true,
          inactiveReason: null,
          currentHost: 'example.com',
          engine: 'dynamicTheme',
          darkThemeDetected: false,
        },
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'page-theme-fetch',
        request: {
          url: 'https://cdn.example.com/theme.css',
          responseType: 'text',
          origin: 'https://example.com',
        },
      }),
    ).toBe(true);
    expect(
      extensionPageThemeEvent({
        channel: EXTENSION_CHANNEL,
        type: 'page-theme-settings-changed',
        settings: pageThemeSettings,
      }),
    ).toBe(true);
    const mediaSpeedSettings = {
      ...defaultMediaSpeedSettings(),
      revision: 2,
      siteOverrides: {
        'example.com': {
          lockSpeed: true as const,
          selection: { mode: 'standard' as const, speed: 1.75 },
        },
      },
    };
    const mediaSpeedSnapshot = {
      revision: 2,
      status: 'ready' as const,
      enabled: true,
      activeOnPage: true,
      currentHost: 'example.com',
      lockSpeed: true,
      mediaCount: 1,
      videoCount: 1,
      audioCount: 0,
      selection: { mode: 'standard' as const, speed: 1.75 },
      showWheel: true,
      wheelItems: mediaSpeedSettings.wheelItems,
    };
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'media-speed-settings-save',
        settings: mediaSpeedSettings,
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'media-speed-frame-report',
        videoCount: 1,
        audioCount: 0,
      }),
    ).toBe(true);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'media-speed-frame-report',
        videoCount: 1,
      }),
    ).toBe(false);
    expect(
      extensionMediaSpeedStateEvent({
        channel: EXTENSION_CHANNEL,
        type: 'media-speed-state-changed',
        settings: mediaSpeedSettings,
        selection: mediaSpeedSnapshot.selection,
        activeOnPage: true,
      }),
    ).toBe(true);
    expect(
      extensionMediaSpeedPageSnapshotEvent({
        channel: EXTENSION_CHANNEL,
        type: 'media-speed-page-snapshot',
        snapshot: mediaSpeedSnapshot,
      }),
    ).toBe(true);
  });

  it('rejects invalid Safari userscript runtime phases', () => {
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'safari-userscript-runtime-run',
        runAt: 'after-paint',
      }),
    ).toBe(false);
  });

  it('rejects messages outside the product channel', () => {
    expect(extensionRequest({ type: 'sync-userscripts' })).toBe(false);
    expect(extensionRuntimeEvent(null)).toBe(false);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'content-blocking-general-save',
        settings: { rulesEnabled: true, allowlist: [42] },
      }),
    ).toBe(false);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'content-blocking-user-rules-add',
        rules: [42],
        session: { sessionId: 'session-1', startedAt: 1 },
      }),
    ).toBe(false);
    expect(extensionContentBlockingEvent({ snapshot: {} })).toBe(false);
    expect(extensionPageThemeEvent({ settings: {} })).toBe(false);
    expect(
      audioPlaybackRequest({
        channel: EXTENSION_CHANNEL,
        type: 'audio-playback-play',
        requestId: 'audio-2',
        cue: 'unknown',
        options: {},
        settings: { muted: false, volume: 0.78 },
      }),
    ).toBe(false);
    expect(
      offscreenAudioCommand({
        channel: OFFSCREEN_AUDIO_CHANNEL,
        type: 'audio-playback-play',
        requestId: 'audio-3',
        cue: 'deckHover',
        options: { pan: 2 },
        settings: { muted: false, volume: 0.78 },
      }),
    ).toBe(false);
    expect(
      offscreenAudioPlaybackResult({
        channel: OFFSCREEN_AUDIO_CHANNEL,
        type: 'audio-playback-result',
        requestId: 'audio-3',
        cue: 'deckHover',
        playback: { result: 'rejected' },
      }),
    ).toBe(false);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'userscript-install-confirm',
        sourceUrl: 'https://cdn.example.com/download/42',
        source: '// ==UserScript==',
      }),
    ).toBe(false);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'ai-model-service-save',
        config: {
          baseUrl: 'https://router.example/v1',
          model: 'unlisted-model',
          protocol: 'unknown',
          reasoningEffort: 'high',
        },
      }),
    ).toBe(false);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'userscript-settings-write',
        settings: {
          reloadAfterScriptChange: false,
          updateIntervalDays: 'daily',
          updateEnabledOnly: true,
        },
      }),
    ).toBe(false);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'userscript-cover-generate',
        prompt: '',
        injectDefaultStyle: true,
      }),
    ).toBe(false);
    expect(
      extensionRequest({
        channel: EXTENSION_CHANNEL,
        type: 'userscript-cover-generate',
        prompt: 'valid prompt',
        injectDefaultStyle: 'yes',
      }),
    ).toBe(false);
  });

  it('accepts serializable user-script HTTP requests', () => {
    expect(
      userScriptMessage({
        type: 'http-request',
        requestId: 'request-1',
        details: {
          url: 'https://api.example.com/data',
          responseType: 'json',
          timeout: 5000,
        },
      }),
    ).toBe(true);
    expect(
      userScriptMessage({
        type: 'http-request',
        requestId: 'request-blob',
        details: {
          method: 'POST',
          url: 'https://api.example.com/file',
          data: new Blob(['body']),
          responseType: 'blob',
          cookie: 'session=one',
        },
      }),
    ).toBe(true);
    expect(
      userScriptMessage({
        type: 'fetch-request',
        requestId: 'request-2',
        details: {
          method: 'POST',
          url: 'https://connect.linux.do/',
          data: new Uint8Array([1, 2, 3]).buffer,
          responseType: 'arraybuffer',
        },
      }),
    ).toBe(true);
    expect(
      userScriptMessage({
        type: 'http-request',
        requestId: 'request-3',
        details: {
          url: 'https://api.example.com/data',
          onload: () => undefined,
        },
      }),
    ).toBe(false);
  });

  it('round-trips capability-scoped user-script port names', () => {
    expect(
      parseUserScriptPortName(userScriptPortName('script:one/二', 'secret')),
    ).toEqual({
      scriptId: 'script:one/二',
      capability: 'secret',
    });
    expect(parseUserScriptPortName(`${EXTENSION_CHANNEL}:broken`)).toBeNull();
    expect(parseUserScriptPortName(assistantPortName(7))).toBeNull();
    expect(
      parseUserScriptPortName(assistantSurfaceLifecyclePortName(7)),
    ).toBeNull();
    expect(
      parseUserScriptPortName(sponsorRuntimePortName('youtube', 'popup')),
    ).toBeNull();
  });

  it('requires mutation identities for GM value writes', () => {
    expect(
      userScriptMessage({
        type: 'set-value',
        mutationId: 'mutation-1',
        key: 'theme',
        value: 'dark',
      }),
    ).toBe(true);
    expect(userScriptMessage({ type: 'delete-value', key: 'theme' })).toBe(
      false,
    );
  });

  it('restricts the MAIN-world bridge to command lifecycle messages', () => {
    expect(mainWorldRuntimeMessage({ type: 'ready' })).toBe(true);
    expect(
      mainWorldRuntimeMessage({
        type: 'runtime-error',
        error: 'Callback failed.',
      }),
    ).toBe(true);
    expect(
      mainWorldRuntimeMessage({
        type: 'set-value',
        mutationId: 'mutation-1',
        key: 'secret',
        value: 'blocked',
      }),
    ).toBe(false);
  });

  it('accepts bounded Userscript AI requests and abort identities', () => {
    expect(
      userScriptMessage({
        type: 'ai-request',
        requestId: 'ai-1',
        request: {
          input: 'Summarize this page.',
          reasoningEffort: 'medium',
        },
      }),
    ).toBe(true);
    expect(
      userScriptMessage({
        type: 'abort-ai-request',
        requestId: 'ai-1',
      }),
    ).toBe(true);
    expect(
      userScriptMessage({
        type: 'ai-request',
        requestId: 'ai-2',
        request: { input: '' },
      }),
    ).toBe(false);
  });

  it('accepts only named Userscript capability requests', () => {
    expect(
      userScriptMessage({
        type: 'capability-request',
        requestId: 'capability-1',
        capability: 'open-tab',
        payload: { url: 'https://example.com/' },
      }),
    ).toBe(true);
    expect(
      userScriptMessage({
        type: 'capability-request',
        requestId: 'capability-2',
        capability: 'raw-extension-api',
      }),
    ).toBe(false);
  });
});
