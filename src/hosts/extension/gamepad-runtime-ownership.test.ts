import { readFileSync } from 'node:fs';

import { describe, expect, it, vi } from 'vitest';

import {
  GAMEPAD_CONTROL_FOCUS_STYLE_ID,
  GAMEPAD_CONTROL_HOST_ID,
  isCurrentGamepadControlHost,
  removeStaleGamepadControlArtifacts,
} from './gamepad-runtime-ownership';

describe('gamepad runtime ownership', () => {
  it('removes every stale host and focus style before mounting', () => {
    const artifacts = Array.from({ length: 4 }, () => ({
      remove: vi.fn(),
    }));
    const root = {
      querySelectorAll: vi.fn(() => artifacts),
    };

    removeStaleGamepadControlArtifacts(root);

    expect(root.querySelectorAll).toHaveBeenCalledWith(
      `[id="${GAMEPAD_CONTROL_HOST_ID}"], [id="${GAMEPAD_CONTROL_FOCUS_STYLE_ID}"]`,
    );
    expect(
      artifacts.every((artifact) => artifact.remove.mock.calls.length === 1),
    ).toBe(true);
  });

  it('recognizes only the connected host currently owned by the document', () => {
    const current = { isConnected: true };
    const stale = { isConnected: false };
    const root = {
      getElementById: vi.fn(() => current),
    };

    expect(isCurrentGamepadControlHost(root, current)).toBe(true);
    expect(isCurrentGamepadControlHost(root, stale)).toBe(false);
    expect(
      isCurrentGamepadControlHost(
        { getElementById: () => ({ isConnected: true }) },
        current,
      ),
    ).toBe(false);
  });

  it('clears the always-on popover backdrop from the page cascade', () => {
    const source = readFileSync(
      new URL('./gamepad-control-content.ts', import.meta.url),
      'utf8',
    );
    expect(source).toContain(
      `#\${GAMEPAD_CONTROL_HOST_ID}::backdrop{background:transparent!important;pointer-events:none!important;}`,
    );
  });
});
