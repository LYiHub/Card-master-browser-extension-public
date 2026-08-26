const PAGE_RUNTIME_EVENT_PREFIX = 'card-master:replace-runtime:';

type RuntimeReplacementDetail = {
  replaced: boolean;
};

export function claimPageRuntime(
  runtimeName: string,
  dispose: () => void,
  target: Pick<
    Document,
    'addEventListener' | 'dispatchEvent' | 'removeEventListener'
  > = document,
) {
  const eventName = `${PAGE_RUNTIME_EVENT_PREFIX}${runtimeName}`;
  const replacement: RuntimeReplacementDetail = { replaced: false };
  const replacementEvent = new Event(eventName);
  Object.defineProperty(replacementEvent, 'detail', { value: replacement });
  target.dispatchEvent(replacementEvent);

  let owned = true;
  const handleReplacement = (event: Event) => {
    if (!owned) return;
    const detail = (
      event as Event & {
        detail?: RuntimeReplacementDetail;
      }
    ).detail;
    if (detail) {
      detail.replaced = true;
    }
    owned = false;
    target.removeEventListener(eventName, handleReplacement);
    dispose();
  };
  target.addEventListener(eventName, handleReplacement);

  return {
    replacedExisting: replacement.replaced,
    release: () => {
      if (!owned) return;
      owned = false;
      target.removeEventListener(eventName, handleReplacement);
    },
  };
}
