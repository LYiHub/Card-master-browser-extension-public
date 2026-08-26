import { Crosshair, Gauge, Zap } from 'lucide-react';
import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { UiSegmentedControl } from '../../components/ui/Ui';
import { gamepadStickAxes } from '../../gamepad-control/domain/bindings';
import { normalizedGamepadStickMagnitude } from '../../gamepad-control/domain/input';
import { advanceGamepadMotion } from '../../gamepad-control/domain/motion';
import {
  applyGamepadResponseCurve,
  cloneGamepadResponseCurve,
  GAMEPAD_FEEL_PRESETS,
  type GamepadFeelPreset,
  type GamepadResponseCurve,
  matchingGamepadFeelPreset,
  normalizeGamepadResponseCurve,
} from '../../gamepad-control/domain/response-curve';
import type { GamepadControlSettings } from '../../gamepad-control/domain/settings';
import type { GamepadInputSnapshot } from '../../gamepad-control/domain/types';

type CurveKind = 'cursor' | 'scroll';
type CurvePoint = keyof GamepadResponseCurve;
type FeelPatch = Pick<
  GamepadControlSettings,
  | 'cursorRampMs'
  | 'cursorResponse'
  | 'cursorSpeed'
  | 'scrollResponse'
  | 'scrollSpeed'
>;

const CURVE_MODES = [
  { value: 'cursor', label: '光标曲线' },
  { value: 'scroll', label: '滚动曲线' },
] as const;

const GRAPH = {
  left: 42,
  right: 322,
  top: 18,
  bottom: 202,
  width: 280,
  height: 184,
} as const;

const PRESET_ICONS = {
  precision: Crosshair,
  balanced: Gauge,
  rapid: Zap,
} as const;

function graphPoint(point: { x: number; y: number }) {
  return {
    x: GRAPH.left + point.x * GRAPH.width,
    y: GRAPH.bottom - point.y * GRAPH.height,
  };
}

function curvePath(curve: GamepadResponseCurve) {
  const first = graphPoint(curve.p1);
  const second = graphPoint(curve.p2);
  return `M ${GRAPH.left} ${GRAPH.bottom} C ${first.x} ${first.y}, ${second.x} ${second.y}, ${GRAPH.right} ${GRAPH.top}`;
}

function curveAreaPath(curve: GamepadResponseCurve) {
  return `${curvePath(curve)} L ${GRAPH.right} ${GRAPH.bottom} Z`;
}

function presetPatch(preset: GamepadFeelPreset): FeelPatch {
  return {
    cursorSpeed: preset.cursorSpeed,
    scrollSpeed: preset.scrollSpeed,
    cursorRampMs: preset.cursorRampMs,
    cursorResponse: cloneGamepadResponseCurve(preset.cursorResponse),
    scrollResponse: cloneGamepadResponseCurve(preset.scrollResponse),
  };
}

function pointValue(
  curve: GamepadResponseCurve,
  point: CurvePoint,
  x: number,
  y: number,
) {
  const next = cloneGamepadResponseCurve(curve);
  next[point] =
    point === 'p1'
      ? {
          x: Math.min(x, curve.p2.x),
          y: Math.min(y, curve.p2.y),
        }
      : {
          x: Math.max(x, curve.p1.x),
          y: Math.max(y, curve.p1.y),
        };
  return normalizeGamepadResponseCurve(next);
}

export function GamepadResponseCurveEditor({
  settings,
  snapshot,
  onChange,
}: {
  settings: GamepadControlSettings;
  snapshot: GamepadInputSnapshot;
  onChange: (patch: FeelPatch) => void;
}) {
  const graphRef = useRef<SVGSVGElement>(null);
  const [kind, setKind] = useState<CurveKind>('cursor');
  const [dragging, setDragging] = useState<CurvePoint | null>(null);
  const [liveMotion, setLiveMotion] = useState(0);
  const liveMotionRef = useRef(0);
  const curve =
    kind === 'cursor' ? settings.cursorResponse : settings.scrollResponse;
  const speed = kind === 'cursor' ? settings.cursorSpeed : settings.scrollSpeed;
  const axes = gamepadStickAxes(
    kind === 'cursor'
      ? settings.bindings.primaryStick
      : settings.bindings.secondaryStick,
  );
  const liveInput = normalizedGamepadStickMagnitude(
    snapshot,
    axes,
    settings.stickDeadZone,
  );
  const liveOutput = applyGamepadResponseCurve(liveInput, curve);
  const liveTargetRef = useRef(liveOutput);
  liveTargetRef.current = liveOutput;
  const livePoint = graphPoint({ x: liveInput, y: liveOutput });
  const displayedMotion = kind === 'cursor' ? liveMotion : liveOutput;
  const activePreset = matchingGamepadFeelPreset(settings);
  const activePresetLabel =
    GAMEPAD_FEEL_PRESETS.find((preset) => preset.id === activePreset)?.label ??
    '自定义';

  useEffect(() => {
    liveMotionRef.current = 0;
    setLiveMotion(0);
    if (!snapshot.connected || kind !== 'cursor') return;
    let frame = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      const next = advanceGamepadMotion({
        current: { x: liveMotionRef.current, y: 0 },
        target: { x: liveTargetRef.current, y: 0 },
        elapsedMs: now - previous,
        accelerationMs: settings.cursorRampMs,
      }).x;
      previous = now;
      liveMotionRef.current = next;
      setLiveMotion((current) =>
        Math.abs(current - next) >= 0.0005 ? next : current,
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [kind, settings.cursorRampMs, snapshot.connected]);

  const guideLines = useMemo(
    () =>
      [0.25, 0.5, 0.75].map((value) => ({
        value,
        x: GRAPH.left + value * GRAPH.width,
        y: GRAPH.bottom - value * GRAPH.height,
      })),
    [],
  );

  const commitCurve = (next: GamepadResponseCurve) => {
    onChange({
      cursorSpeed: settings.cursorSpeed,
      scrollSpeed: settings.scrollSpeed,
      cursorRampMs: settings.cursorRampMs,
      cursorResponse: kind === 'cursor' ? next : settings.cursorResponse,
      scrollResponse: kind === 'scroll' ? next : settings.scrollResponse,
    });
  };

  const updatePointFromPointer = (
    point: CurvePoint,
    event: PointerEvent<SVGCircleElement>,
  ) => {
    const bounds = graphRef.current?.getBoundingClientRect();
    if (!bounds) return;
    const scale = Math.min(bounds.width / 360, bounds.height / 230);
    const contentWidth = 360 * scale;
    const contentHeight = 230 * scale;
    const localX =
      (event.clientX - bounds.left - (bounds.width - contentWidth) / 2) / scale;
    const localY =
      (event.clientY - bounds.top - (bounds.height - contentHeight) / 2) /
      scale;
    const x = Math.min(1, Math.max(0, (localX - GRAPH.left) / GRAPH.width));
    const y = Math.min(1, Math.max(0, (GRAPH.bottom - localY) / GRAPH.height));
    commitCurve(pointValue(curve, point, x, y));
  };

  const handlePointKeyDown = (
    point: CurvePoint,
    event: KeyboardEvent<SVGCircleElement>,
  ) => {
    const step = event.shiftKey ? 0.05 : 0.02;
    const delta =
      event.key === 'ArrowLeft'
        ? { x: -step, y: 0 }
        : event.key === 'ArrowRight'
          ? { x: step, y: 0 }
          : event.key === 'ArrowUp'
            ? { x: 0, y: step }
            : event.key === 'ArrowDown'
              ? { x: 0, y: -step }
              : null;
    if (!delta) return;
    event.preventDefault();
    commitCurve(
      pointValue(
        curve,
        point,
        curve[point].x + delta.x,
        curve[point].y + delta.y,
      ),
    );
  };

  return (
    <div className="gamepad-response">
      <section className="gamepad-response__presets" aria-label="手柄手感预设">
        <header>
          <div>
            <strong className="gamepad-response__title">响应预设</strong>
            <span className="gamepad-response__description">
              先选整体手感，再微调速度与曲线
            </span>
          </div>
          <output>{activePresetLabel}</output>
        </header>
        <div>
          {GAMEPAD_FEEL_PRESETS.map((preset) => {
            const Icon = PRESET_ICONS[preset.id];
            const active = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                aria-pressed={active}
                className={active ? 'is-active' : undefined}
                onClick={() => onChange(presetPatch(preset))}
              >
                <span aria-hidden="true">
                  <Icon size={18} />
                </span>
                <strong className="gamepad-response__preset-name">
                  {preset.label}
                </strong>
                <small className="gamepad-response__preset-description">
                  {preset.description}
                </small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="gamepad-response__editor">
        <header>
          <UiSegmentedControl
            label="选择要编辑的响应曲线"
            value={kind}
            options={CURVE_MODES}
            onChange={setKind}
          />
          <div className="gamepad-response__readout">
            <span>{Math.round(liveInput * 100)}% 输入</span>
            <strong className="gamepad-response__readout-value">
              当前 {Math.round(displayedMotion * speed)} px/s
            </strong>
            {kind === 'cursor' && (
              <small className="gamepad-response__target-value">
                当前上限 {Math.round(liveOutput * speed)} px/s
              </small>
            )}
          </div>
        </header>

        <div className="gamepad-response__graph">
          <svg
            ref={graphRef}
            viewBox="0 0 360 230"
            role="img"
            aria-label={`${kind === 'cursor' ? '光标' : '滚动'}摇杆响应曲线`}
          >
            <defs>
              <linearGradient
                id={`gamepad-response-area-${kind}`}
                x1="0"
                y1="1"
                x2="1"
                y2="0"
              >
                <stop offset="0" stopColor="#8f6b31" stopOpacity="0.08" />
                <stop offset="1" stopColor="#f2cd69" stopOpacity="0.34" />
              </linearGradient>
              <filter
                id={`gamepad-response-glow-${kind}`}
                x="-70%"
                y="-70%"
                width="240%"
                height="240%"
              >
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {guideLines.map((guide) => (
              <g key={guide.value} className="gamepad-response__grid">
                <line
                  x1={guide.x}
                  y1={GRAPH.top}
                  x2={guide.x}
                  y2={GRAPH.bottom}
                />
                <line
                  x1={GRAPH.left}
                  y1={guide.y}
                  x2={GRAPH.right}
                  y2={guide.y}
                />
              </g>
            ))}
            <path
              className="gamepad-response__area"
              d={curveAreaPath(curve)}
              fill={`url(#gamepad-response-area-${kind})`}
            />
            <line
              className="gamepad-response__baseline"
              x1={GRAPH.left}
              y1={GRAPH.bottom}
              x2={GRAPH.right}
              y2={GRAPH.top}
            />
            <line
              className="gamepad-response__control-line"
              x1={GRAPH.left}
              y1={GRAPH.bottom}
              x2={graphPoint(curve.p1).x}
              y2={graphPoint(curve.p1).y}
            />
            <line
              className="gamepad-response__control-line"
              x1={GRAPH.right}
              y1={GRAPH.top}
              x2={graphPoint(curve.p2).x}
              y2={graphPoint(curve.p2).y}
            />
            <path className="gamepad-response__curve" d={curvePath(curve)} />

            {(['p1', 'p2'] as const).map((point, index) => {
              const position = graphPoint(curve[point]);
              return (
                <circle
                  key={point}
                  className={
                    dragging === point
                      ? 'gamepad-response__handle is-dragging'
                      : 'gamepad-response__handle'
                  }
                  cx={position.x}
                  cy={position.y}
                  r="8"
                  role="slider"
                  tabIndex={0}
                  aria-label={`控制点 ${index + 1}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(curve[point].y * 100)}
                  aria-valuetext={`输入 ${Math.round(curve[point].x * 100)}%，输出 ${Math.round(curve[point].y * 100)}%`}
                  onKeyDown={(event) => handlePointKeyDown(point, event)}
                  onPointerDown={(event) => {
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setDragging(point);
                    updatePointFromPointer(point, event);
                  }}
                  onPointerMove={(event) => {
                    if (
                      event.currentTarget.hasPointerCapture(event.pointerId)
                    ) {
                      updatePointFromPointer(point, event);
                    }
                  }}
                  onPointerUp={(event) => {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                    setDragging(null);
                  }}
                  onPointerCancel={() => setDragging(null)}
                />
              );
            })}

            {snapshot.connected && liveInput > 0 && (
              <circle
                className="gamepad-response__live"
                cx={livePoint.x}
                cy={livePoint.y}
                r="5"
                filter={`url(#gamepad-response-glow-${kind})`}
              />
            )}

            <text x={GRAPH.left} y="221">
              轻推
            </text>
            <text x={GRAPH.right} y="221" textAnchor="end">
              满幅
            </text>
            <text
              x="15"
              y={(GRAPH.top + GRAPH.bottom) / 2}
              textAnchor="middle"
              transform={`rotate(-90 15 ${(GRAPH.top + GRAPH.bottom) / 2})`}
            >
              输出速度
            </text>
          </svg>
          <div className="gamepad-response__values">
            <span>
              控制点 1
              <b>
                {Math.round(curve.p1.x * 100)} / {Math.round(curve.p1.y * 100)}
              </b>
            </span>
            <span>
              控制点 2
              <b>
                {Math.round(curve.p2.x * 100)} / {Math.round(curve.p2.y * 100)}
              </b>
            </span>
            <small className="gamepad-response__values-note">
              横轴为摇杆幅度，纵轴为速度输出
            </small>
          </div>
        </div>
      </section>
    </div>
  );
}
