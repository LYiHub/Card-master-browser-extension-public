import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ControllerProfile } from './controller-artwork';
import {
  applyControllerSnapshot,
  controllerArtworkPath,
  controllerProfile,
  createControllerSvg,
} from './controller-artwork';

type FakeSvgNode = {
  classes: Set<string>;
  matches: (selector: string) => boolean;
  node: SVGElement;
  style: {
    fill: string;
    stroke: string;
    transform: string;
    setProperty: ReturnType<typeof vi.fn>;
  };
};

function createFakeSvgNode(classNames: string, children: FakeSvgNode[] = []) {
  const classes = new Set(classNames.split(' ').filter(Boolean));
  const dataset: Record<string, string | undefined> = {};
  const style = {
    fill: '#303638',
    stroke: '#111718',
    transform: '',
    setProperty: vi.fn(),
  };
  const matches = (selector: string) =>
    selector
      .split(',')
      .some((candidate) => classes.has(candidate.trim().replace(/^\./, '')));
  const node = {
    classList: {
      contains: (className: string) => classes.has(className),
      remove: (...classNamesToRemove: string[]) => {
        classNamesToRemove.forEach((className) => {
          classes.delete(className);
        });
      },
      toggle: (className: string, force?: boolean) => {
        const enabled = force ?? !classes.has(className);
        if (enabled) classes.add(className);
        else classes.delete(className);
        return enabled;
      },
    },
    dataset,
    hasAttribute: (attribute: string) =>
      attribute === 'data-gamepad-default-fill' &&
      dataset.gamepadDefaultFill !== undefined,
    querySelector: (selector: string) =>
      children.find((child) => child.matches(selector))?.node ?? null,
    style,
  } as unknown as SVGElement;
  return { classes, matches, node, style };
}

function createFakeRoot(nodes: FakeSvgNode[]) {
  return {
    querySelector: (selector: string) =>
      nodes.find((node) => node.matches(selector))?.node ?? null,
    querySelectorAll: (selector: string) =>
      nodes.filter((node) => node.matches(selector)).map((node) => node.node),
  } as unknown as ParentNode;
}

const TEST_PROFILE: ControllerProfile = {
  kind: 'dual-shock-4',
  buttonSelectors: ['.button-cross'],
  leftAxis: null,
  rightAxis: null,
};

const TEST_SNAPSHOT = {
  connected: true,
  index: 0,
  id: 'Test Controller',
  mapping: 'standard',
  buttons: [0],
  axes: [],
};

afterEach(() => vi.unstubAllGlobals());

describe('controller artwork profiles', () => {
  it('uses the PlayStation-compatible profile for DualSense controllers', () => {
    const profile = controllerProfile(
      'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
    );

    expect(profile.kind).toBe('dual-shock-4');
    expect(profile.buttonSelectors[6]).toBe('.button-l2');
    expect(profile.buttonSelectors[7]).toBe('.button-r2');
    expect(controllerArtworkPath(profile.kind)).toContain('dual-shock-4.svg');
  });

  it('selects the paired Joy-Con layout without changing standard indices', () => {
    const profile = controllerProfile('Nintendo Switch Joy-Con');

    expect(profile.kind).toBe('joy-con');
    expect(profile.leftAxis).toEqual([0, 1]);
    expect(profile.rightAxis).toEqual([2, 3]);
  });

  it('evicts failed artwork requests so a later retry performs a new fetch', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 404 });
    vi.stubGlobal('fetch', fetch);
    const request = () =>
      createControllerSvg({
        kind: 'dual-shock-4',
        url: 'extension://artwork-retry.svg',
        ownerDocument: {} as Document,
      });

    await expect(request()).rejects.toThrow('503');
    await expect(request()).rejects.toThrow('404');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('renders a current press more strongly than a verified button', () => {
    const button = createFakeSvgNode('button button-cross');
    const root = createFakeRoot([button]);

    applyControllerSnapshot(root, TEST_SNAPSHOT, TEST_PROFILE, {
      buttons: [true],
    });
    expect(button.classes.has('is-tested')).toBe(true);
    expect(button.classes.has('is-active')).toBe(false);
    expect(button.style.fill).toBe('#78a799');
    expect(button.style.stroke).toBe('#294a41');

    applyControllerSnapshot(
      root,
      { ...TEST_SNAPSHOT, buttons: [1] },
      TEST_PROFILE,
      { buttons: [true] },
    );
    expect(button.classes.has('is-tested')).toBe(true);
    expect(button.classes.has('is-active')).toBe(true);
    expect(button.style.fill).toBe('#ffd44f');
    expect(button.style.stroke).toBe('#211708');
  });

  it('keeps verified and current joystick feedback on the artwork', () => {
    const cap = createFakeSvgNode('button button-l3');
    const stick = createFakeSvgNode('axis-l-container', [cap]);
    const root = createFakeRoot([stick, cap]);
    const profile: ControllerProfile = {
      ...TEST_PROFILE,
      buttonSelectors: [],
      leftAxis: [0, 1],
    };

    applyControllerSnapshot(root, { ...TEST_SNAPSHOT, axes: [0, 0] }, profile, {
      axes: [true, true],
    });
    expect(stick.classes.has('is-tested')).toBe(true);
    expect(stick.classes.has('is-active')).toBe(false);
    expect(cap.classes.has('is-tested')).toBe(true);
    expect(cap.style.fill).toBe('#78a799');

    applyControllerSnapshot(
      root,
      { ...TEST_SNAPSHOT, axes: [0.8, 0.6] },
      profile,
      { axes: [true, true] },
    );
    expect(stick.classes.has('is-active')).toBe(true);
    expect(cap.classes.has('is-stick-active')).toBe(true);
    expect(cap.style.fill).toBe('#ffd44f');
  });
});
