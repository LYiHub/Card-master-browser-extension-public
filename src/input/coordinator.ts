import type { GamepadControlSettings } from '../gamepad-control/domain/settings';
import type { GamepadInputSnapshot } from '../gamepad-control/domain/types';
import {
  readGamepadSnapshot,
  requestGamepadBrowserTabSwitch,
  subscribeGamepadSnapshot,
} from '../hosts/extension/gamepad-bridge';
import { GamepadIntentAdapter } from './gamepad-intent-adapter';
import {
  type InputModality,
  type IntentEnvelope,
  keyboardIntent,
} from './intents';

export const INPUT_SCOPE_PRIORITY = {
  webpage: 100,
  deck: 500,
  actionRing: 600,
  workspace: 700,
  expandedView: 800,
  dialog: 1_000,
  testCapture: 2_000,
} as const;

export type InputScope = {
  id: string;
  priority: number;
  modalities?: readonly InputModality[];
  active?: () => boolean;
  exclusive?: boolean;
  handle: (event: IntentEnvelope) => boolean;
};

export type EscapeLayerRegistration = {
  id: string;
  priority: number;
  active?: () => boolean;
  onEscape: () => void;
};

type EscapeLayerEntry = EscapeLayerRegistration & {
  sequence: number;
};

function consumeKeyboardEvent(event: KeyboardEvent) {
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
}

export class EscapeLayerStack {
  private readonly entries: EscapeLayerEntry[] = [];
  private sequence = 0;

  register(registration: EscapeLayerRegistration) {
    const entry: EscapeLayerEntry = {
      ...registration,
      sequence: ++this.sequence,
    };
    this.entries.push(entry);
    this.entries.sort(
      (left, right) =>
        left.priority - right.priority || left.sequence - right.sequence,
    );
    return () => {
      const index = this.entries.indexOf(entry);
      if (index >= 0) this.entries.splice(index, 1);
    };
  }

  handle(event: KeyboardEvent) {
    if (
      event.key !== 'Escape' ||
      event.repeat ||
      event.isComposing ||
      this.entries.length === 0
    ) {
      return false;
    }
    let activeEntry: EscapeLayerEntry | undefined;
    for (let index = this.entries.length - 1; index >= 0; index -= 1) {
      const entry = this.entries[index];
      if (entry?.active?.() === false) continue;
      activeEntry = entry;
      break;
    }
    if (!activeEntry) return false;
    consumeKeyboardEvent(event);
    activeEntry.onEscape();
    return true;
  }

  clear() {
    this.entries.length = 0;
  }
}

export function gamepadScopeUsesSemanticIntents(
  scope: Pick<InputScope, 'exclusive'>,
) {
  return scope.exclusive !== true;
}

export function selectInputScope<
  T extends Pick<InputScope, 'active' | 'modalities'>,
>(scopes: readonly T[], modality: InputModality) {
  for (let index = scopes.length - 1; index >= 0; index -= 1) {
    const scope = scopes[index];
    if (
      scope &&
      scope.active?.() !== false &&
      (scope.modalities === undefined || scope.modalities.includes(modality))
    ) {
      return scope;
    }
  }
  return null;
}

export function routeInputIntent(
  event: IntentEnvelope,
  scope: Pick<InputScope, 'exclusive' | 'handle'> | null,
  switchBrowserTab: (direction: 'previous' | 'next') => void,
) {
  if (scope) {
    const handled = scope.handle(event);
    if (handled || scope.exclusive) return true;
  }
  if (event.intent.type === 'browserTabPrevious') {
    switchBrowserTab('previous');
    return true;
  }
  if (event.intent.type === 'browserTabNext') {
    switchBrowserTab('next');
    return true;
  }
  return false;
}

type ScopeEntry = InputScope & {
  root: Document | ShadowRoot;
  sequence: number;
};

type ObservedRoot = {
  registrations: number;
  cleanup: () => void;
};

function ownerDocument(root: Document | ShadowRoot) {
  return root instanceof Document ? root : root.ownerDocument;
}

function rootView(root: Document | ShadowRoot) {
  return ownerDocument(root).defaultView;
}

export class InputCoordinator {
  private readonly scopes: ScopeEntry[] = [];
  private readonly observedRoots = new Map<
    Document | ShadowRoot,
    ObservedRoot
  >();
  private readonly modalityListeners = new Set<
    (modality: InputModality) => void
  >();
  private readonly processedKeyboardEvents = new WeakSet<KeyboardEvent>();
  private readonly escapeLayers = new EscapeLayerStack();
  private readonly gamepadAdapter = new GamepadIntentAdapter();
  private readonly unsubscribeGamepadSnapshot: () => void;
  private snapshot: GamepadInputSnapshot;
  private modality: InputModality = 'pointer';
  private sequence = 0;
  private frame = 0;
  private pointerHandoffOrigin: { x: number; y: number } | null = null;
  private disposed = false;

  constructor(private readonly pageDocument: Document) {
    const host = pageDocument.defaultView ?? globalThis;
    this.snapshot = readGamepadSnapshot(host);
    this.publishRootModality(pageDocument);
    this.unsubscribeGamepadSnapshot = subscribeGamepadSnapshot(
      this.handleGamepadSnapshot,
      host,
    );
    pageDocument.defaultView?.addEventListener(
      'keydown',
      this.handleKeyboardEvent,
      true,
    );
    pageDocument.addEventListener(
      'keydown',
      this.handleDocumentKeyboardEvent,
      true,
    );
    pageDocument.addEventListener('pointerdown', this.handlePointerDown);
    pageDocument.addEventListener('pointermove', this.handlePointerMove);
    pageDocument.addEventListener(
      'visibilitychange',
      this.handleVisibilityChange,
    );
    this.syncGamepadFrame();
  }

  private topScope(modality: InputModality) {
    return selectInputScope(this.scopes, modality);
  }

  private setModality(modality: InputModality) {
    if (this.modality === modality) return;
    this.modality = modality;
    if (modality !== 'pointer') this.pointerHandoffOrigin = null;
    for (const root of this.observedRoots.keys()) {
      this.publishRootModality(root);
    }
    for (const listener of this.modalityListeners) listener(modality);
  }

  private publishRootModality(root: Document | ShadowRoot) {
    const target =
      root instanceof ShadowRoot ? root.host : root.documentElement;
    if (target instanceof HTMLElement) {
      target.dataset.cardMasterInputModality = this.modality;
    }
  }

  private dispatch(event: IntentEnvelope) {
    if (event.source === 'gamepad') this.setModality('gamepad');
    return routeInputIntent(event, this.topScope(event.source), (direction) =>
      requestGamepadBrowserTabSwitch(
        direction,
        this.pageDocument.defaultView ?? globalThis,
      ),
    );
  }

  private readonly handleGamepadSnapshot = () => {
    this.snapshot = readGamepadSnapshot(
      this.pageDocument.defaultView ?? globalThis,
    );
    if (!this.snapshot.connected) this.gamepadAdapter.reset();
    this.syncGamepadFrame();
  };

  private readonly handleKeyboardEvent = (rawEvent: Event) => {
    if (
      rawEvent.type !== 'keydown' ||
      typeof (rawEvent as KeyboardEvent).key !== 'string' ||
      !rawEvent.isTrusted
    ) {
      return;
    }
    const event = rawEvent as KeyboardEvent;
    if (this.processedKeyboardEvents.has(event)) return;
    this.processedKeyboardEvents.add(event);
    this.setModality('keyboard');
    if (this.escapeLayers.handle(event)) return;
    const intent = keyboardIntent(event);
    if (!intent) return;
    const handled = this.dispatch({
      intent,
      source: 'keyboard',
      deviceId: null,
      phase: event.repeat ? 'repeated' : 'pressed',
      timestamp: event.timeStamp,
    });
    if (!handled) return;
    consumeKeyboardEvent(event);
  };

  private readonly handleDocumentKeyboardEvent = (event: Event) => {
    const active = this.pageDocument.activeElement;
    const focusedShadowRoot = [...this.observedRoots.keys()].some(
      (root) => root instanceof ShadowRoot && root.host === active,
    );
    if (focusedShadowRoot) return;
    this.handleKeyboardEvent(event);
  };

  private readonly handlePointerDown = (event: Event) => {
    if (!(event instanceof PointerEvent) || !event.isTrusted) return;
    this.pointerHandoffOrigin = null;
    this.setModality('pointer');
  };

  private readonly handlePointerMove = (event: Event) => {
    if (!(event instanceof PointerEvent) || !event.isTrusted) return;
    if (this.modality === 'pointer') return;
    const origin = this.pointerHandoffOrigin;
    if (!origin) {
      this.pointerHandoffOrigin = { x: event.clientX, y: event.clientY };
      return;
    }
    if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) >= 6) {
      this.pointerHandoffOrigin = null;
      this.setModality('pointer');
    }
  };

  private readonly handleVisibilityChange = () => {
    this.gamepadAdapter.requireNeutral();
    this.syncGamepadFrame();
  };

  private readonly gamepadTick = (timestamp: number) => {
    this.frame = 0;
    const scope = this.topScope('gamepad');
    if (
      !this.snapshot.connected ||
      !scope ||
      this.pageDocument.visibilityState !== 'visible'
    ) {
      return;
    }
    if (!gamepadScopeUsesSemanticIntents(scope)) {
      // Exclusive scopes observe raw snapshots separately. Translating one of
      // those snapshots would allow test input to escape as a browser command.
      this.gamepadAdapter.requireNeutral();
      this.frame =
        rootView(this.pageDocument)?.requestAnimationFrame(this.gamepadTick) ??
        0;
      return;
    }
    for (const event of this.gamepadAdapter.update(this.snapshot, timestamp)) {
      this.dispatch(event);
    }
    this.frame =
      rootView(this.pageDocument)?.requestAnimationFrame(this.gamepadTick) ?? 0;
  };

  private syncGamepadFrame() {
    const view = rootView(this.pageDocument);
    if (!view) return;
    if (
      !this.snapshot.connected ||
      !this.topScope('gamepad') ||
      this.pageDocument.visibilityState !== 'visible'
    ) {
      view.cancelAnimationFrame(this.frame);
      this.frame = 0;
      return;
    }
    if (!this.frame) this.frame = view.requestAnimationFrame(this.gamepadTick);
  }

  private acquireRoot(root: Document | ShadowRoot) {
    const current = this.observedRoots.get(root);
    if (current) {
      current.registrations += 1;
      return () => this.releaseRoot(root);
    }
    this.publishRootModality(root);
    const cleanup =
      root === this.pageDocument
        ? () => undefined
        : () => {
            root.removeEventListener('keydown', this.handleKeyboardEvent, true);
            root.removeEventListener(
              'pointerdown',
              this.handlePointerDown,
              true,
            );
            root.removeEventListener(
              'pointermove',
              this.handlePointerMove,
              true,
            );
          };
    if (root !== this.pageDocument) {
      root.addEventListener('keydown', this.handleKeyboardEvent, true);
      root.addEventListener('pointerdown', this.handlePointerDown, true);
      root.addEventListener('pointermove', this.handlePointerMove, true);
    }
    this.observedRoots.set(root, {
      registrations: 1,
      cleanup,
    });
    return () => this.releaseRoot(root);
  }

  private releaseRoot(root: Document | ShadowRoot) {
    const current = this.observedRoots.get(root);
    if (!current) return;
    current.registrations -= 1;
    if (current.registrations > 0) return;
    current.cleanup();
    this.observedRoots.delete(root);
  }

  register(root: Document | ShadowRoot, scope: InputScope) {
    const releaseRoot = this.acquireRoot(root);
    const previousTop = this.topScope('gamepad');
    const entry: ScopeEntry = {
      ...scope,
      root,
      sequence: ++this.sequence,
    };
    this.scopes.push(entry);
    this.scopes.sort(
      (left, right) =>
        left.priority - right.priority || left.sequence - right.sequence,
    );
    if (this.topScope('gamepad') !== previousTop) {
      this.gamepadAdapter.requireNeutral();
    }
    this.syncGamepadFrame();
    return () => {
      const previous = this.topScope('gamepad');
      const index = this.scopes.indexOf(entry);
      if (index >= 0) this.scopes.splice(index, 1);
      if (this.topScope('gamepad') !== previous) {
        this.gamepadAdapter.requireNeutral();
      }
      releaseRoot();
      this.syncGamepadFrame();
    };
  }

  registerEscapeLayer(registration: EscapeLayerRegistration) {
    return this.escapeLayers.register(registration);
  }

  configureGamepad(
    settings: Pick<
      GamepadControlSettings,
      | 'bindings'
      | 'repeatDelayMs'
      | 'repeatIntervalMs'
      | 'scrollResponse'
      | 'scrollSpeed'
      | 'stickDeadZone'
    >,
  ) {
    this.gamepadAdapter.configure(settings);
    this.gamepadAdapter.requireNeutral();
  }

  subscribeModality(listener: (modality: InputModality) => void) {
    this.modalityListeners.add(listener);
    listener(this.modality);
    return () => {
      this.modalityListeners.delete(listener);
    };
  }

  currentModality() {
    return this.modality;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    const view = this.pageDocument.defaultView;
    this.unsubscribeGamepadSnapshot();
    view?.removeEventListener('keydown', this.handleKeyboardEvent, true);
    this.pageDocument.removeEventListener(
      'keydown',
      this.handleDocumentKeyboardEvent,
      true,
    );
    this.pageDocument.removeEventListener(
      'pointerdown',
      this.handlePointerDown,
    );
    this.pageDocument.removeEventListener(
      'pointermove',
      this.handlePointerMove,
    );
    this.pageDocument.removeEventListener(
      'visibilitychange',
      this.handleVisibilityChange,
    );
    view?.cancelAnimationFrame(this.frame);
    this.frame = 0;
    for (const [root, observed] of this.observedRoots) {
      observed.cleanup();
      const target =
        root instanceof ShadowRoot ? root.host : root.documentElement;
      if (target instanceof HTMLElement) {
        delete target.dataset.cardMasterInputModality;
      }
    }
    this.observedRoots.clear();
    delete this.pageDocument.documentElement.dataset.cardMasterInputModality;
    this.scopes.length = 0;
    this.escapeLayers.clear();
    this.modalityListeners.clear();
    this.gamepadAdapter.reset();
  }
}

const coordinators = new WeakMap<Document, InputCoordinator>();

export function inputCoordinatorFor(root: Document | ShadowRoot) {
  const document = ownerDocument(root);
  const current = coordinators.get(document);
  if (current) return current;
  const coordinator = new InputCoordinator(document);
  coordinators.set(document, coordinator);
  return coordinator;
}

export function disposeInputCoordinator(root: Document | ShadowRoot) {
  const document = ownerDocument(root);
  const coordinator = coordinators.get(document);
  if (!coordinator) return;
  coordinators.delete(document);
  coordinator.dispose();
}
