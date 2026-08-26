type RecommendationRefreshOptions = {
  attempts?: number;
  intervalMs?: number;
  wait?: (durationMs: number) => Promise<void>;
};

function clickable(value: Element | null): value is HTMLElement {
  return Boolean(
    value &&
      typeof (value as HTMLElement).click === 'function' &&
      !(
        'disabled' in value &&
        (value as HTMLButtonElement | HTMLInputElement).disabled
      ),
  );
}

export function findBilibiliRecommendationRefreshButton(
  root: ParentNode,
): HTMLElement | null {
  const rollButton = root.querySelector('.roll-btn');
  if (clickable(rollButton)) return rollButton;

  const container = root.querySelector('.feed-roll-btn');
  const nestedButton =
    container?.querySelector('button, [role="button"], [tabindex]') ?? null;
  if (clickable(nestedButton)) return nestedButton;
  if (container?.matches('button, [role="button"]') && clickable(container)) {
    return container;
  }
  return null;
}

export function isBilibiliHomepage(
  location: Pick<Location, 'hostname' | 'pathname'>,
) {
  return location.hostname === 'www.bilibili.com' && location.pathname === '/';
}

export async function refreshBilibiliRecommendations(
  root: ParentNode,
  {
    attempts = 20,
    intervalMs = 100,
    wait = (durationMs) =>
      new Promise<void>((resolve) => window.setTimeout(resolve, durationMs)),
  }: RecommendationRefreshOptions = {},
) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const button = findBilibiliRecommendationRefreshButton(root);
    if (button) {
      button.click();
      return true;
    }
    if (attempt + 1 < attempts) await wait(intervalMs);
  }
  return false;
}
