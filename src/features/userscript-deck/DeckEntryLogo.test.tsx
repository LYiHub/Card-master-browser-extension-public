import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DeckEntryLogo } from './DeckEntryLogo';

describe('DeckEntryLogo', () => {
  it('renders the shared Card Master logo asset', () => {
    const markup = renderToStaticMarkup(
      <DeckEntryLogo className="shared-deck-logo" />,
    );

    expect(markup).toContain('class="shared-deck-logo"');
    expect(markup).toContain(
      '/project-assets/userscript-deck/visual/action-icons/card-master-logo.png',
    );
    expect(markup).toContain('draggable="false"');
  });
});
