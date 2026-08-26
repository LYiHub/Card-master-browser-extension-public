export const GAMEPAD_POINTER_TIMELINE_IDS = [
  'cursorEntrance',
  'cursorLocator',
  'cursorPress',
  'cursorExit',
  'targetEntrance',
  'targetChange',
  'targetTrack',
  'targetExit',
] as const;

export type GamepadPointerTimelineId =
  (typeof GAMEPAD_POINTER_TIMELINE_IDS)[number];

export type GamepadPointerMotionProperty =
  | 'opacity'
  | 'scale'
  | 'rotation'
  | 'brightness'
  | 'progress';

export type GamepadPointerTimelinePoint = {
  id: string;
  timeMs: number;
  value: number;
  ease?: string;
};

export type GamepadPointerTimelineTrack = {
  property: GamepadPointerMotionProperty;
  label: string;
  color: string;
  min: number;
  max: number;
  unit: string;
  chartOnly?: boolean;
  points: GamepadPointerTimelinePoint[];
};

export type GamepadPointerTimeline = {
  label: string;
  description: string;
  target: 'cursor' | 'locator' | 'target';
  setInitialState: boolean;
  tracks: GamepadPointerTimelineTrack[];
};

const TRACK_PRESENTATION: Record<
  GamepadPointerMotionProperty,
  Omit<GamepadPointerTimelineTrack, 'property' | 'points'>
> = {
  opacity: {
    label: '透明度',
    color: '#75c7b4',
    min: 0,
    max: 1,
    unit: '',
  },
  scale: {
    label: '缩放',
    color: '#edc45a',
    min: 0.6,
    max: 6,
    unit: 'x',
  },
  rotation: {
    label: '旋转',
    color: '#e87863',
    min: -12,
    max: 12,
    unit: 'deg',
  },
  brightness: {
    label: '亮度',
    color: '#8eb7d9',
    min: 0.6,
    max: 1.5,
    unit: 'x',
  },
  progress: {
    label: '位移进度',
    color: '#b8cf78',
    min: 0,
    max: 1,
    unit: '',
    chartOnly: true,
  },
};

function track(
  property: GamepadPointerMotionProperty,
  points: Array<Omit<GamepadPointerTimelinePoint, 'id'>>,
): GamepadPointerTimelineTrack {
  return {
    property,
    ...TRACK_PRESENTATION[property],
    points: points.map((point, index) => ({
      id: `${property}-${index + 1}`,
      ...point,
    })),
  };
}

export const GAMEPAD_POINTER_TIMELINES: Record<
  GamepadPointerTimelineId,
  GamepadPointerTimeline
> = {
  cursorEntrance: {
    label: '准星出现',
    description: '从较大尺寸快速收紧，轻微回弹后稳定在目标位置。',
    target: 'cursor',
    setInitialState: true,
    tracks: [
      track('opacity', [
        { timeMs: 0, value: 0 },
        { timeMs: 180, value: 1, ease: 'power3.out' },
      ]),
      track('scale', [
        { timeMs: 0, value: 5.2 },
        { timeMs: 180, value: 0.82, ease: 'power3.out' },
        { timeMs: 310, value: 1.12, ease: 'power2.out' },
        { timeMs: 510, value: 1, ease: 'back.out(2.4)' },
      ]),
      track('rotation', [
        { timeMs: 0, value: -8 },
        { timeMs: 180, value: 0, ease: 'power3.out' },
        { timeMs: 310, value: 2, ease: 'power2.out' },
        { timeMs: 510, value: 0, ease: 'back.out(2.4)' },
      ]),
      track('brightness', [
        { timeMs: 0, value: 1.3 },
        { timeMs: 180, value: 1.08, ease: 'power3.out' },
        { timeMs: 310, value: 1.16, ease: 'power2.out' },
        { timeMs: 510, value: 1, ease: 'back.out(2.4)' },
      ]),
    ],
  },
  cursorLocator: {
    label: '准星定位脉冲',
    description: '长时间未操作后重新移动时，用外环帮助快速找回准星。',
    target: 'locator',
    setInitialState: true,
    tracks: [
      track('opacity', [
        { timeMs: 0, value: 0 },
        { timeMs: 400, value: 0.88, ease: 'power4.out' },
        { timeMs: 740, value: 0, ease: 'power2.inOut' },
      ]),
      track('scale', [
        { timeMs: 0, value: 5.6 },
        { timeMs: 400, value: 0.86, ease: 'power4.out' },
        { timeMs: 740, value: 1.42, ease: 'power2.inOut' },
      ]),
    ],
  },
  cursorPress: {
    label: '准星点击回弹',
    description: '确认点击时先压缩，再超过原尺寸，最后回到稳定状态。',
    target: 'cursor',
    setInitialState: false,
    tracks: [
      track('opacity', [
        { timeMs: 0, value: 1 },
        { timeMs: 70, value: 1, ease: 'power2.in' },
      ]),
      track('scale', [
        { timeMs: 0, value: 1 },
        { timeMs: 70, value: 0.76, ease: 'power2.in' },
        { timeMs: 180, value: 1.1, ease: 'power3.out' },
        { timeMs: 320, value: 1, ease: 'back.out(2.6)' },
      ]),
    ],
  },
  cursorExit: {
    label: '准星消失',
    description: '虚拟鼠标交还给真实指针或其他界面时柔和收束。',
    target: 'cursor',
    setInitialState: false,
    tracks: [
      track('opacity', [
        { timeMs: 0, value: 1 },
        { timeMs: 140, value: 0, ease: 'power2.in' },
      ]),
      track('scale', [
        { timeMs: 0, value: 1 },
        { timeMs: 160, value: 0.84, ease: 'power2.in' },
      ]),
    ],
  },
  targetEntrance: {
    label: '目标框出现',
    description: '命中可选元素时先快速收紧，再轻微扩张并稳定。',
    target: 'target',
    setInitialState: true,
    tracks: [
      track('opacity', [
        { timeMs: 0, value: 0 },
        { timeMs: 170, value: 1, ease: 'power3.out' },
      ]),
      track('scale', [
        { timeMs: 0, value: 1.12 },
        { timeMs: 170, value: 0.94, ease: 'power3.out' },
        { timeMs: 290, value: 1.04, ease: 'power2.out' },
        { timeMs: 470, value: 1, ease: 'back.out(2.2)' },
      ]),
      track('brightness', [
        { timeMs: 0, value: 1.38 },
        { timeMs: 170, value: 1.38, ease: 'none' },
        { timeMs: 290, value: 1.12, ease: 'power2.out' },
        { timeMs: 470, value: 1, ease: 'back.out(2.2)' },
      ]),
    ],
  },
  targetChange: {
    label: '目标框切换',
    description: '准星跨越到新元素时，目标框连续移动并短暂增强亮度。',
    target: 'target',
    setInitialState: false,
    tracks: [
      track('progress', [
        { timeMs: 0, value: 0 },
        { timeMs: 200, value: 1, ease: 'power3.out' },
      ]),
      track('opacity', [
        { timeMs: 0, value: 1 },
        { timeMs: 200, value: 1, ease: 'power3.out' },
      ]),
      track('scale', [
        { timeMs: 0, value: 1 },
        { timeMs: 200, value: 1, ease: 'power3.out' },
      ]),
      track('brightness', [
        { timeMs: 0, value: 1 },
        { timeMs: 200, value: 1.18, ease: 'power3.out' },
        { timeMs: 360, value: 1, ease: 'power2.out' },
      ]),
    ],
  },
  targetTrack: {
    label: '目标框跟随',
    description: '页面滚动或尺寸变化时，目标框以较短时间跟随同一元素。',
    target: 'target',
    setInitialState: false,
    tracks: [
      track('progress', [
        { timeMs: 0, value: 0 },
        { timeMs: 120, value: 1, ease: 'power3.out' },
      ]),
      track('opacity', [
        { timeMs: 0, value: 1 },
        { timeMs: 120, value: 1, ease: 'power3.out' },
      ]),
      track('scale', [
        { timeMs: 0, value: 1 },
        { timeMs: 120, value: 1, ease: 'power3.out' },
      ]),
      track('brightness', [
        { timeMs: 0, value: 1 },
        { timeMs: 120, value: 1, ease: 'power3.out' },
      ]),
    ],
  },
  targetExit: {
    label: '目标框消失',
    description: '失去目标或离开页面控制时降低亮度并轻微缩小。',
    target: 'target',
    setInitialState: false,
    tracks: [
      track('opacity', [
        { timeMs: 0, value: 1 },
        { timeMs: 140, value: 0, ease: 'power2.in' },
      ]),
      track('scale', [
        { timeMs: 0, value: 1 },
        { timeMs: 140, value: 0.96, ease: 'power2.in' },
      ]),
      track('brightness', [
        { timeMs: 0, value: 1 },
        { timeMs: 140, value: 0.78, ease: 'power2.in' },
      ]),
    ],
  },
};

export function gamepadPointerTimelineDurationMs(
  timeline: GamepadPointerTimeline,
) {
  return Math.max(
    0,
    ...timeline.tracks.flatMap((timelineTrack) =>
      timelineTrack.points.map((point) => point.timeMs),
    ),
  );
}

export function gamepadPointerTimelineTrack(
  timeline: GamepadPointerTimeline,
  property: GamepadPointerMotionProperty,
) {
  return (
    timeline.tracks.find(
      (timelineTrack) => timelineTrack.property === property,
    ) ?? null
  );
}
