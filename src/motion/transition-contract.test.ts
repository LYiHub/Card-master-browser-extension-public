import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('shared transition contract', () => {
  it('keeps transient content crisp and avoids terminal transform cleanup', () => {
    const transitions = readFileSync(
      new URL('./transitions.css', import.meta.url),
      'utf8',
    );
    const stageMotion = readFileSync(
      new URL('../components/card-stage-motion.ts', import.meta.url),
      'utf8',
    );
    const library = readFileSync(
      new URL('../features/global-library/global-library.css', import.meta.url),
      'utf8',
    );
    const assistant = readFileSync(
      new URL(
        '../features/assistant/ai-conversation-workbench.css',
        import.meta.url,
      ),
      'utf8',
    );
    const extensionContent = readFileSync(
      new URL('../hosts/extension/content.ts', import.meta.url),
      'utf8',
    );

    expect(transitions).not.toContain('--app-motion-blur-swap');
    expect(transitions).not.toMatch(/filter:\s*blur/);
    expect(transitions).toContain('--app-motion-duration-reduced: 80ms');
    expect(transitions).not.toMatch(/transition-duration:\s*(?:0s|1ms)/);
    expect(extensionContent).not.toMatch(/transition-duration:\s*(?:0s|1ms)/);
    expect(library).not.toMatch(
      /@keyframes global-library-card-plaque-in\s*\{[^}]*filter:/s,
    );
    expect(assistant).not.toMatch(
      /@keyframes cm-assistant-content-in\s*\{[^}]*filter:/s,
    );
    expect(stageMotion).not.toContain(
      "clearProps: 'transform,opacity,visibility'",
    );
  });
});
