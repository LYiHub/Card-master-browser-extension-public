import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MotionIconSwap } from './MotionIconSwap';

describe('MotionIconSwap', () => {
  it('keeps every icon mounted while activating only the selected state', () => {
    const markup = renderToStaticMarkup(
      <MotionIconSwap
        state="ready"
        items={[
          { state: 'idle', icon: <i>idle</i> },
          { state: 'ready', icon: <i>ready</i> },
          { state: 'error', icon: <i>error</i> },
        ]}
      />,
    );

    expect(markup).toContain('idle');
    expect(markup).toContain('ready');
    expect(markup).toContain('error');
    expect(markup.match(/\bis-active\b/g)).toHaveLength(1);
    expect(markup).toContain(
      'app-motion-icon-swap__item is-active"><i>ready</i>',
    );
  });
});
