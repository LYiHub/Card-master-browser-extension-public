import { describe, expect, it } from 'vitest';
import { createMessageReader, formatMessage } from './format';

describe('extension message formatting', () => {
  it('supports positional and case-insensitive named placeholders and dollar escaping', () => {
    expect(
      formatMessage(
        {
          message: '$USER$ / $2 / $$ / $3',
          placeholders: { user: { content: '$1' } },
        },
        ['<script>$&</script>', 'value$1'],
      ),
    ).toBe('<script>$&</script> / value$1 / $ / ');
    expect(
      formatMessage(
        {
          message: '$LINK$',
          placeholders: { link: { content: 'https://example.com/$1?cost=$$' } },
        },
        'docs',
      ),
    ).toBe('https://example.com/docs?cost=$');
  });

  it('uses the requested catalog, default fallback, and diagnostic key in order', () => {
    const read = createMessageReader(
      { translated: { message: '設定' } },
      { fallback: { message: '回退 $1' }, translated: { message: '设置' } },
    );
    expect(read('TRANSLATED')).toBe('設定');
    expect(read('fallback', ['value'])).toBe('回退 value');
    expect(read('unknown')).toBe('unknown');
  });
});
