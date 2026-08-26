import type { GamepadInputSnapshot } from './domain/types';

export type ControllerProfile = {
  kind: 'dual-shock-4' | 'joy-con';
  buttonSelectors: readonly (string | null)[];
  leftAxis: readonly [number, number] | null;
  rightAxis: readonly [number, number] | null;
};

const DUAL_SHOCK_BUTTON_SELECTORS = [
  '.button-cross',
  '.button-circle',
  '.button-square',
  '.button-triangle',
  '.button-l1',
  '.button-r1',
  '.button-l2',
  '.button-r2',
  '.button-share',
  '.button-options',
  '.button-l3',
  '.button-r3',
  '.button-dpad-up',
  '.button-dpad-down',
  '.button-dpad-left',
  '.button-dpad-right',
  '.button-ps',
  '.button-touchpad',
] as const;

const JOY_CON_LEFT_BUTTON_SELECTORS = [
  '.button-left',
  '.button-down',
  '.button-up',
  '.button-right',
  null,
  null,
  null,
  null,
  '.button-l',
  '.button-minus',
  '.button-l3',
  null,
  null,
  null,
  null,
  null,
  '.button-capture',
] as const;

const JOY_CON_RIGHT_BUTTON_SELECTORS = [
  '.button-a',
  '.button-x',
  '.button-b',
  '.button-y',
  null,
  null,
  null,
  null,
  '.button-r',
  '.button-plus',
  '.button-r3',
  null,
  null,
  null,
  null,
  null,
  '.button-home',
] as const;

const JOY_CON_PAIR_BUTTON_SELECTORS = [
  '.button-b',
  '.button-a',
  '.button-y',
  '.button-x',
  '.button-l',
  '.button-r',
  null,
  null,
  '.button-minus',
  '.button-plus',
  '.button-l3',
  '.button-r3',
  '.button-up',
  '.button-down',
  '.button-left',
  '.button-right',
  '.button-home',
  '.button-capture',
] as const;

const CONTROLLER_ARTWORK = {
  'dual-shock-4': {
    path: 'userscript-deck/visual/gamepad/dual-shock-4.svg',
    width: 600,
    height: 400,
  },
  'joy-con': {
    path: 'userscript-deck/visual/gamepad/joy-con.svg',
    width: 580,
    height: 360,
  },
} as const;

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const STICK_ACTIVE_THRESHOLD = 0.12;
const controllerSourceCache = new Map<string, Promise<string>>();

export function controllerProfile(id: string): ControllerProfile {
  if (/joy-con \(l\)/i.test(id)) {
    return {
      kind: 'joy-con',
      buttonSelectors: JOY_CON_LEFT_BUTTON_SELECTORS,
      leftAxis: [0, 1],
      rightAxis: null,
    };
  }
  if (/joy-con \(r\)/i.test(id)) {
    return {
      kind: 'joy-con',
      buttonSelectors: JOY_CON_RIGHT_BUTTON_SELECTORS,
      leftAxis: null,
      rightAxis: [0, 1],
    };
  }
  if (/joy-con/i.test(id)) {
    return {
      kind: 'joy-con',
      buttonSelectors: JOY_CON_PAIR_BUTTON_SELECTORS,
      leftAxis: [0, 1],
      rightAxis: [2, 3],
    };
  }
  return {
    kind: 'dual-shock-4',
    buttonSelectors: DUAL_SHOCK_BUTTON_SELECTORS,
    leftAxis: [0, 1],
    rightAxis: [2, 3],
  };
}

export function controllerArtworkPath(kind: ControllerProfile['kind']) {
  return CONTROLLER_ARTWORK[kind].path;
}

async function controllerSource(url: string) {
  const cached = controllerSourceCache.get(url);
  if (cached) return cached;
  const request = fetch(url)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`无法载入手柄可视化素材：${response.status}`);
      }
      return response.text();
    })
    .catch((error) => {
      if (controllerSourceCache.get(url) === request) {
        controllerSourceCache.delete(url);
      }
      throw error;
    });
  controllerSourceCache.set(url, request);
  return request;
}

export async function createControllerSvg({
  kind,
  url,
  ownerDocument = document,
}: {
  kind: ControllerProfile['kind'];
  url: string;
  ownerDocument?: Document;
}) {
  const artwork = CONTROLLER_ARTWORK[kind];
  const source = await controllerSource(url);
  const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
  const svg = parsed.documentElement;
  if (!(svg instanceof SVGSVGElement)) {
    throw new Error('手柄可视化素材不是有效的 SVG。');
  }
  svg.setAttribute('viewBox', `0 0 ${artwork.width} ${artwork.height}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('aria-hidden', 'true');
  if (kind === 'dual-shock-4') addDualShockTriggerLayers(svg);
  return ownerDocument.importNode(svg, true);
}

function addDualShockTriggerLayers(svg: SVGSVGElement) {
  const caseContainer = svg.querySelector('#case-container');
  if (!caseContainer || svg.querySelector('.button-l2, .button-r2')) return;
  const triggerDefinitions = [
    {
      className: 'button button-l2 gamepad-trigger',
      path: 'M 98 40 C 111 19 138 9 168 23 L 166 40 C 143 31 120 34 99 48 Z',
    },
    {
      className: 'button button-r2 gamepad-trigger',
      path: 'M 502 40 C 489 19 462 9 432 23 L 434 40 C 457 31 480 34 501 48 Z',
    },
  ] as const;
  for (const definition of [...triggerDefinitions].reverse()) {
    const trigger = svg.ownerDocument.createElementNS(SVG_NAMESPACE, 'path');
    trigger.setAttribute('class', definition.className);
    trigger.setAttribute('d', definition.path);
    trigger.setAttribute(
      'style',
      'fill:#858b8d;stroke:#000;stroke-width:1;opacity:0.9',
    );
    caseContainer.prepend(trigger);
  }
}

function setStickPosition(
  root: ParentNode,
  selector: string,
  axes: readonly number[],
  indices: readonly [number, number] | null,
  tested = false,
) {
  const stick = root.querySelector<SVGGElement>(selector);
  if (!stick) return;
  const x = indices ? (axes[indices[0]] ?? 0) : 0;
  const y = indices ? (axes[indices[1]] ?? 0) : 0;
  const intensity = Math.min(1, Math.hypot(x, y));
  const active = intensity > STICK_ACTIVE_THRESHOLD;
  stick.style.transform = `translate(${x * 10}px, ${y * 10}px)`;
  stick.style.setProperty(
    '--gamepad-stick-glow',
    `${Math.round(6 + intensity * 14)}px`,
  );
  stick.classList.toggle('is-active', active);
  stick.classList.toggle('is-tested', tested);
  const cap = stick.querySelector<SVGElement>('.button-l3, .button-r3');
  if (!cap) return;
  cap.classList.toggle('is-stick-active', active);
  cap.classList.toggle('is-tested', tested);
  if (active) {
    cap.style.fill = '#ffd44f';
    cap.style.stroke = '#211708';
  } else if (tested) {
    cap.style.fill = '#78a799';
    cap.style.stroke = '#294a41';
  }
}

export function applyControllerSnapshot(
  root: ParentNode,
  snapshot: GamepadInputSnapshot,
  profile: ControllerProfile,
  tested?: {
    buttons?: readonly boolean[];
    axes?: readonly boolean[];
  },
) {
  for (const button of root.querySelectorAll<SVGElement>('.button')) {
    if (!button.hasAttribute('data-gamepad-default-fill')) {
      button.dataset.gamepadDefaultFill = button.style.fill;
      button.dataset.gamepadDefaultStroke = button.style.stroke;
      button.dataset.gamepadDefaultTransform = button.style.transform;
    }
    button.classList.remove('is-active', 'is-stick-active', 'is-tested');
    button.style.fill = button.dataset.gamepadDefaultFill ?? '';
    button.style.stroke = button.dataset.gamepadDefaultStroke ?? '';
    button.style.transform = button.dataset.gamepadDefaultTransform ?? '';
  }
  profile.buttonSelectors.forEach((selector, index) => {
    if (!selector) return;
    const value = snapshot.buttons[index] ?? 0;
    for (const button of root.querySelectorAll<SVGElement>(selector)) {
      const active = value > 0.08;
      const verified = tested?.buttons?.[index] === true;
      button.classList.toggle('is-active', active);
      button.classList.toggle('is-tested', verified);
      if (active) {
        button.style.fill = '#ffd44f';
        button.style.stroke = '#211708';
      } else if (verified) {
        button.style.fill = '#78a799';
        button.style.stroke = '#294a41';
      }
      if (button.classList.contains('gamepad-trigger')) {
        button.style.transform = `translateY(${value * 5}px)`;
      }
    }
  });
  setStickPosition(
    root,
    '.axis-l-container',
    snapshot.axes,
    profile.leftAxis,
    Boolean(profile.leftAxis?.some((index) => tested?.axes?.[index] === true)),
  );
  setStickPosition(
    root,
    '.axis-r-container',
    snapshot.axes,
    profile.rightAxis,
    Boolean(profile.rightAxis?.some((index) => tested?.axes?.[index] === true)),
  );
}
