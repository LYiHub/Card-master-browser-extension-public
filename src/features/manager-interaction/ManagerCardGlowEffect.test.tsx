import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ManagerCardGlowEffect } from './ManagerCardGlowEffect';

describe('ManagerCardGlowEffect', () => {
  it('renders the complete shared glow stack around one centered wrapper', () => {
    const markup = renderToStaticMarkup(<ManagerCardGlowEffect active />);

    expect(markup).toContain('manager-card-glow-effect is-active');
    expect(markup).toContain('manager-card__charge-aura');
    expect(markup).toContain('manager-card__charge-ring');
    expect(markup).toContain('manager-card__charge-rays');
    expect(markup).toContain('manager-card__charge-flash');
  });
});
