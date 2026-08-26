import { describe, expect, it } from 'vitest';

import {
  createElementHidingRule,
  strictElementSelector,
} from './element-hiding-rule';

type TestElement = {
  id: string;
  localName: string;
  classList: string[];
  parentElement: TestElement | null;
  children: TestElement[];
  ownerDocument: TestDocument;
};

type TestDocument = {
  body: TestElement;
  querySelectorAll(selector: string): TestElement[];
};

function testTree() {
  const elements: TestElement[] = [];
  const document = {
    body: null as unknown as TestElement,
    querySelectorAll(selector: string) {
      if (!selector.startsWith('#')) return [];
      const id = selector.slice(1).replaceAll('\\:', ':');
      return elements.filter((element) => element.id === id);
    },
  } satisfies TestDocument;
  const node = (
    localName: string,
    options: { id?: string; classes?: string[] } = {},
  ): TestElement => {
    const element = {
      id: options.id ?? '',
      localName,
      classList: options.classes ?? [],
      parentElement: null,
      children: [],
      ownerDocument: document,
    } satisfies TestElement;
    elements.push(element);
    return element;
  };
  const append = (parent: TestElement, child: TestElement) => {
    parent.children.push(child);
    child.parentElement = parent;
  };
  const body = node('body');
  document.body = body;
  return { append, body, node };
}

describe('element hiding rules', () => {
  it('uses a unique element id as the shortest strict selector', () => {
    const { append, body, node } = testTree();
    const target = node('aside', { id: 'promo:rail' });
    append(body, target);

    expect(strictElementSelector(target as unknown as Element)).toBe(
      '#promo\\:rail',
    );
  });

  it('uses stable classes without positional selectors when siblings differ', () => {
    const { append, body, node } = testTree();
    const main = node('main');
    const sibling = node('p');
    const target = node('div', { classes: ['ad', 'banner'] });
    append(body, main);
    append(main, sibling);
    append(main, target);

    expect(strictElementSelector(target as unknown as Element)).toBe(
      'main > div.ad.banner',
    );
  });

  it('creates a domain-scoped AdGuard cosmetic rule', () => {
    const { append, body, node } = testTree();
    const target = node('aside', { id: 'sponsor' });
    append(body, target);

    expect(
      createElementHidingRule(
        target as unknown as Element,
        'https://www.example.com/article?from=home',
      ),
    ).toBe('www.example.com###sponsor');
  });

  it('drops generated classes and falls back to type position only when needed', () => {
    const { append, body, node } = testTree();
    const main = node('main');
    const first = node('div', { classes: ['css-a82f9d20', 'ad-slot'] });
    const target = node('div', { classes: ['css-b93f8e31', 'ad-slot'] });
    append(body, main);
    append(main, first);
    append(main, target);

    expect(strictElementSelector(target as unknown as Element)).toBe(
      'main > div.ad-slot:nth-of-type(2)',
    );
  });

  it('rejects pages that cannot host persistent web filtering rules', () => {
    const { append, body, node } = testTree();
    const target = node('aside', { id: 'sponsor' });
    append(body, target);

    expect(() =>
      createElementHidingRule(target as unknown as Element, 'file:///note'),
    ).toThrow('页面协议');
  });
});
