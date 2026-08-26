import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const readStyles = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

describe('card geometry', () => {
  it('keeps every card surface on the canonical proportional shape', () => {
    const cards = readStyles('../userscript-deck/styles/cards.css');
    const install = readStyles('../../hosts/extension/install-styles/card.css');
    const library = readStyles('../global-library/global-library.css');
    const management = readStyles('../userscript-deck/styles/management.css');

    expect(cards).toContain('--manager-card-radius-x: 4%;');
    expect(cards).toContain('--manager-card-radius-y: 3%;');
    expect(cards).toContain(
      'clip-path: inset(0 round var(--manager-card-radius));',
    );

    expect(install).toContain('aspect-ratio: 3 / 4;');
    expect(install).toContain('border-radius: var(--manager-card-radius);');
    expect(install).not.toContain('aspect-ratio: 0.69;');
    expect(install).not.toMatch(/border-radius:\s*(?:0 0 )?6px/);

    expect(library).toContain('--manager-card-radius-x: 4%;');
    expect(library).toContain('border-radius: var(--manager-card-radius);');
    expect(management).toContain('border-radius: 4% / 3%;');
  });
});
