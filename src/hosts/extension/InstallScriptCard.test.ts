import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('InstallScriptCard', () => {
  it('keeps the holographic sparkle material enabled for valid previews', () => {
    const source = readFileSync(
      new URL('./InstallScriptCard.tsx', import.meta.url),
      'utf8',
    );
    const materialSource = readFileSync(
      new URL(
        '../../features/manager-interaction/CardMaterialLayers.tsx',
        import.meta.url,
      ),
      'utf8',
    );

    expect(source).toContain('finish="holographic"');
    expect(source).toContain('sparklesUrl={assets.sparkles}');
    expect(source).toContain("showSparkles={status !== 'error'}");
    expect(source).toContain(
      "const shouldPlay = assets.media.kind === 'video' && playing;",
    );
    expect(source).toContain('video.muted = true;');
    expect(source).toContain('preload="auto"');
    expect(source).not.toContain('setInteractive');
    expect(source).not.toContain('onPointerEnter');
    expect(source).toContain('waiting');
    expect(source).toContain('<UiLoader compact label="正在写入牌库" />');
    expect(materialSource).toContain('card-material__sparkles');
    expect(materialSource).not.toContain('card-material__foil');
    expect(materialSource).not.toContain('card-material__glare');
  });
});
