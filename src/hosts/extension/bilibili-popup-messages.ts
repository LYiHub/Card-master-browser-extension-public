// The player sends its startup message on iframe load, even if translations are still loading.
export function listenForBilibiliPopupParent(frame: Window) {
  let pending: MessageEvent | undefined;
  function remember(event: MessageEvent) {
    if (
      event.source !== frame.parent ||
      !event.origin.endsWith('.bilibili.com')
    )
      return;
    // The optional style message also authorizes the popup, so keep it over an empty ping.
    if (!pending || event.data?.type === 'style') pending = event;
  }
  frame.addEventListener('message', remember);

  return (listener: (event: MessageEvent) => void) => {
    frame.removeEventListener('message', remember);
    frame.addEventListener('message', listener);
    if (pending) listener(pending);
    pending = undefined;
  };
}
