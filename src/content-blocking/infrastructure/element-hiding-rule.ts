function escapeCssIdentifier(value: string) {
  const nativeEscape = globalThis.CSS?.escape;
  if (nativeEscape) return nativeEscape(value);

  return Array.from(value, (character, index) => {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint === 0) return '\uFFFD';
    if (
      (codePoint >= 1 && codePoint <= 31) ||
      codePoint === 127 ||
      (index === 0 && codePoint >= 48 && codePoint <= 57) ||
      (index === 1 &&
        codePoint >= 48 &&
        codePoint <= 57 &&
        value.charCodeAt(0) === 45)
    ) {
      return `\\${codePoint.toString(16)} `;
    }
    if (index === 0 && character === '-' && value.length === 1) return '\\-';
    if (
      codePoint >= 128 ||
      character === '-' ||
      character === '_' ||
      (codePoint >= 48 && codePoint <= 57) ||
      (codePoint >= 65 && codePoint <= 90) ||
      (codePoint >= 97 && codePoint <= 122)
    ) {
      return character;
    }
    return `\\${character}`;
  }).join('');
}

const STABLE_ATTRIBUTES = [
  'data-testid',
  'data-test',
  'data-id',
  'aria-label',
  'name',
  'role',
] as const;
const GENERATED_CLASS =
  /^(?:css|jsx|sc|styled|emotion)-|(?:^|[-_])[a-f0-9]{7,}(?:$|[-_])|\d{5,}/i;

function escapeCssString(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function uniqueSelector(element: Element, selector: string) {
  try {
    return element.ownerDocument.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
}

function stableClasses(element: Element) {
  return Array.from(element.classList)
    .map((value) => value.trim())
    .filter(
      (value) =>
        value.length > 0 && value.length <= 64 && !GENERATED_CLASS.test(value),
    )
    .slice(0, 2);
}

function attributeSegment(element: Element) {
  if (typeof element.getAttribute !== 'function') return null;
  for (const name of STABLE_ATTRIBUTES) {
    const value = element.getAttribute(name)?.trim();
    if (!value || value.length > 96) continue;
    const selector = `${element.localName}[${name}="${escapeCssString(value)}"]`;
    if (uniqueSelector(element, selector)) return selector;
  }
  return null;
}

function elementSegment(element: Element) {
  const id = element.id.trim();
  if (id) {
    const selector = `#${escapeCssIdentifier(id)}`;
    if (uniqueSelector(element, selector)) return selector;
  }
  const attribute = attributeSegment(element);
  if (attribute) return attribute;
  const classes = stableClasses(element)
    .map((className) => `.${escapeCssIdentifier(className)}`)
    .join('');
  return `${element.localName}${classes}`;
}

function siblingPosition(element: Element, segment: string) {
  const parent = element.parentElement;
  if (!parent) return segment;
  const matching = Array.from(parent.children).filter(
    (sibling) =>
      sibling.localName === element.localName &&
      elementSegment(sibling) === segment,
  );
  if (matching.length <= 1) return segment;
  const sameType = Array.from(parent.children).filter(
    (sibling) => sibling.localName === element.localName,
  );
  return `${segment}:nth-of-type(${sameType.indexOf(element) + 1})`;
}

export function strictElementSelector(element: Element) {
  const path: string[] = [];
  let current: Element | null = element;

  while (current && current !== current.ownerDocument.body) {
    path.unshift(siblingPosition(current, elementSegment(current)));
    const selector = path.join(' > ');
    if (uniqueSelector(element, selector)) return selector;
    current = current.parentElement;
  }

  if (path.length === 0) {
    throw new Error('无法为该页面元素生成稳定的过滤选择器。');
  }
  return path.join(' > ');
}

export function createElementHidingRule(element: Element, pageUrl: string) {
  const url = new URL(pageUrl);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('当前页面协议不支持持久化元素过滤规则。');
  }
  const domain = url.hostname;
  if (!domain) throw new Error('当前页面缺少可用于过滤规则的域名。');
  return `${domain}##${strictElementSelector(element)}`;
}
