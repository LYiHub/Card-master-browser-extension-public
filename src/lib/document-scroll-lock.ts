const LOCK_OWNERS_ATTRIBUTE = 'data-card-master-scroll-lock-owners';
const ROOT_STYLE_ATTRIBUTE = 'data-card-master-root-scroll-style';
const BODY_STYLE_ATTRIBUTE = 'data-card-master-body-scroll-style';

type ScrollStyleSnapshot = {
  overflow: string;
  overflowPriority: string;
  overscrollBehavior: string;
  overscrollBehaviorPriority: string;
};

function readSnapshot(element: HTMLElement): ScrollStyleSnapshot {
  return {
    overflow: element.style.getPropertyValue('overflow'),
    overflowPriority: element.style.getPropertyPriority('overflow'),
    overscrollBehavior: element.style.getPropertyValue('overscroll-behavior'),
    overscrollBehaviorPriority: element.style.getPropertyPriority(
      'overscroll-behavior',
    ),
  };
}

function restoreSnapshot(element: HTMLElement, serialized: string | null) {
  if (!serialized) {
    element.style.removeProperty('overflow');
    element.style.removeProperty('overscroll-behavior');
    return;
  }
  const snapshot = JSON.parse(serialized) as ScrollStyleSnapshot;
  if (snapshot.overflow) {
    element.style.setProperty(
      'overflow',
      snapshot.overflow,
      snapshot.overflowPriority,
    );
  } else {
    element.style.removeProperty('overflow');
  }
  if (snapshot.overscrollBehavior) {
    element.style.setProperty(
      'overscroll-behavior',
      snapshot.overscrollBehavior,
      snapshot.overscrollBehaviorPriority,
    );
  } else {
    element.style.removeProperty('overscroll-behavior');
  }
}

function lockElement(element: HTMLElement) {
  element.style.setProperty('overflow', 'hidden', 'important');
  element.style.setProperty('overscroll-behavior', 'none', 'important');
}

function readOwners(root: HTMLElement) {
  try {
    const value = JSON.parse(root.getAttribute(LOCK_OWNERS_ATTRIBUTE) ?? '[]');
    return Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
}

export function releaseDocumentScrollLock(document: Document, ownerId: string) {
  const root = document.documentElement;
  const body = document.body;
  if (
    !root.hasAttribute(LOCK_OWNERS_ATTRIBUTE) &&
    !root.hasAttribute(ROOT_STYLE_ATTRIBUTE)
  ) {
    return;
  }
  const remaining = readOwners(root).filter(
    (candidate) => candidate !== ownerId && document.getElementById(candidate),
  );
  if (remaining.length > 0) {
    root.setAttribute(LOCK_OWNERS_ATTRIBUTE, JSON.stringify(remaining));
    return;
  }
  restoreSnapshot(root, root.getAttribute(ROOT_STYLE_ATTRIBUTE));
  if (body) {
    restoreSnapshot(body, root.getAttribute(BODY_STYLE_ATTRIBUTE));
  }
  root.removeAttribute(LOCK_OWNERS_ATTRIBUTE);
  root.removeAttribute(ROOT_STYLE_ATTRIBUTE);
  root.removeAttribute(BODY_STYLE_ATTRIBUTE);
}

export function lockDocumentScroll(document: Document, ownerId: string) {
  const root = document.documentElement;
  const body = document.body;
  const activeOwners = readOwners(root).filter((ownerId) =>
    document.getElementById(ownerId),
  );
  if (activeOwners.length === 0 && !root.hasAttribute(ROOT_STYLE_ATTRIBUTE)) {
    root.setAttribute(ROOT_STYLE_ATTRIBUTE, JSON.stringify(readSnapshot(root)));
    if (body) {
      root.setAttribute(
        BODY_STYLE_ATTRIBUTE,
        JSON.stringify(readSnapshot(body)),
      );
    }
  }
  root.setAttribute(
    LOCK_OWNERS_ATTRIBUTE,
    JSON.stringify([...new Set([...activeOwners, ownerId])]),
  );
  lockElement(root);
  if (body) lockElement(body);

  let released = false;
  return () => {
    if (released) return;
    released = true;
    releaseDocumentScrollLock(document, ownerId);
  };
}
