import { afterEach, describe, expect, it, vi } from 'vitest';

import { copyDiagnosticText } from './DiagnosticCopyButton';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('diagnostic clipboard', () => {
  it('copies the complete diagnostic text through the Clipboard API', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const diagnostic = 'first error\nsecond error\nfull stack';

    await copyDiagnosticText(diagnostic);

    expect(writeText).toHaveBeenCalledWith(diagnostic);
  });
});
