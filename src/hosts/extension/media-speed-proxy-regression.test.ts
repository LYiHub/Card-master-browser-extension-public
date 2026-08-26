import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./media-speed-proxy.ts', import.meta.url),
  'utf8',
);

describe('media speed proxy contracts', () => {
  it('invalidates pending write echoes during seek and media loading', () => {
    for (const event of ['seeking', 'seeked', 'loadstart', 'loadedmetadata']) {
      expect(source).toContain(`element.addEventListener('${event}', handle`);
    }
    expect(source).toContain('pendingWrites.delete(element)');
  });

  it('never infers durable settings from page ratechange events', () => {
    expect(source).not.toContain('adoptNativeSelection');
    expect(source).not.toContain('media-speed-selection-set');
    expect(source).not.toContain('lastUserGestureAt');
  });

  it('keeps DOM observation dormant while page control is inactive', () => {
    expect(source).toContain('if (!tracking || observers.has(root)) return;');
    expect(source).toContain('if (!next.active) {\n      stopTracking();');
    expect(source).toContain('startTracking();');
    expect(source).toContain('for (const observer of observers.values())');
  });

  it('observes only structural media changes and ignores extension UI roots', () => {
    expect(source).toContain('EXTENSION_MEDIA_HOST_IDS.has(root.host.id)');
    expect(source).toContain('childList: true');
    expect(source).not.toContain('attributes: true');
    expect(source).not.toContain(
      "'aria-hidden', 'class', 'hidden', 'src', 'style'",
    );
  });

  it('publishes only changed counts without periodic document scans', () => {
    expect(source).toContain('counts.videoCount === publishedVideoCount');
    expect(source).toContain('counts.audioCount === publishedAudioCount');
    expect(source).not.toContain('const reconcile =');
    expect(source).not.toContain('RECONCILE_SLOW_MS');
  });

  it('tracks video and audio while restoring media that leaves control', () => {
    expect(source).toContain("'video, audio'");
    expect(source).toContain('element instanceof HTMLAudioElement');
    expect(source).toContain('restoreElement(element)');
    expect(source).toContain('setMediaPlaybackRate(element, 1)');
  });

  it('scans media already present in the top-level document', () => {
    expect(source).toContain(
      'const scanRoot = (root: Document | ShadowRoot) => {',
    );
    expect(source).toContain('root.querySelectorAll<HTMLMediaElement>');
    expect(source).toContain('scanRoot(root);');
    expect(source.indexOf('observer.observe(root')).toBeLessThan(
      source.indexOf('scanRoot(root);'),
    );
  });

  it('does not ship temporary media diagnostics', () => {
    expect(source).not.toContain('media-speed-debug');
  });
});
