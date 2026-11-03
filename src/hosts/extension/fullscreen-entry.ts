import { reportExtensionFailure } from './diagnostics';

export const FULLSCREEN_ENTRY_ATTRIBUTE = 'data-entry-fullscreen';

// Preserve launch-anchor geometry while hiding every interactive accessory.
export const FULLSCREEN_ENTRY_STYLES = `
  :host([popover]) {
    position: fixed;
    inset: 0;
    width: 100vw;
    height: 100dvh;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    pointer-events: none;
  }
  :host([${FULLSCREEN_ENTRY_ATTRIBUTE}]) :is(.entry, .manager-deck-entry-cluster):not([data-fullscreen-auto-hide="false"]),
  :host([${FULLSCREEN_ENTRY_ATTRIBUTE}]) :is(.entry, .manager-deck-entry-cluster):not([data-fullscreen-auto-hide="false"]) * {
    visibility: hidden !important;
    pointer-events: none !important;
  }
`;

export function installFullscreenEntryVisibility(
  document: Document,
  host: HTMLElement,
) {
  let previousFullscreenElement: Element | null = null;
  const backdrop = document.createElement('style');
  backdrop.textContent = `#${host.id}::backdrop{background:transparent!important;pointer-events:none!important;}`;
  document.documentElement.append(backdrop);

  const clearTopLayer = () => {
    if (!host.hasAttribute('popover')) return;
    try {
      if (host.matches(':popover-open')) host.hidePopover();
    } catch (error) {
      reportExtensionFailure(
        'fullscreen-entry',
        'top-layer-close-failed',
        error,
      );
    } finally {
      host.removeAttribute('popover');
    }
  };
  const apply = () => {
    const webkitDocument = document as Document & {
      webkitFullscreenElement?: Element | null;
    };
    const fullscreenElement =
      document.fullscreenElement ??
      webkitDocument.webkitFullscreenElement ??
      null;
    host.toggleAttribute(
      FULLSCREEN_ENTRY_ATTRIBUTE,
      Boolean(fullscreenElement),
    );
    if (fullscreenElement) {
      try {
        // Disabling our CSS hide must also escape the player's fullscreen layer.
        host.setAttribute('popover', 'manual');
        if (
          fullscreenElement !== previousFullscreenElement &&
          host.matches(':popover-open')
        ) {
          host.hidePopover();
        }
        if (!host.matches(':popover-open')) host.showPopover();
      } catch (error) {
        clearTopLayer();
        reportExtensionFailure(
          'fullscreen-entry',
          'top-layer-open-failed',
          error,
        );
      }
    } else {
      clearTopLayer();
    }
    previousFullscreenElement = fullscreenElement;
  };
  document.addEventListener('fullscreenchange', apply, true);
  document.addEventListener('webkitfullscreenchange', apply, true);
  document.defaultView?.addEventListener('pageshow', apply);
  apply();
  return () => {
    document.removeEventListener('fullscreenchange', apply, { capture: true });
    document.removeEventListener('webkitfullscreenchange', apply, {
      capture: true,
    });
    document.defaultView?.removeEventListener('pageshow', apply);
    clearTopLayer();
    host.removeAttribute(FULLSCREEN_ENTRY_ATTRIBUTE);
    backdrop.remove();
  };
}
