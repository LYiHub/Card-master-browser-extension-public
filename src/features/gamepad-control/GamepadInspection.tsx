import { Eraser } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { UiButton, UiNotice } from '../../components/ui/Ui';
import {
  applyControllerSnapshot,
  controllerArtworkPath,
  controllerProfile,
  createControllerSvg,
} from '../../gamepad-control/controller-artwork';
import { GamepadExitGestureTracker } from '../../gamepad-control/domain/exit-gesture';
import type { GamepadInputSnapshot } from '../../gamepad-control/domain/types';
import { useGamepadSnapshot } from '../../gamepad-control/useGamepadSnapshot';
import {
  INPUT_SCOPE_PRIORITY,
  type InputScope,
  inputCoordinatorFor,
} from '../../input/coordinator';
import { projectAssetUrl } from '../../lib/project-assets';

export const captureGamepadInspectionInput: InputScope['handle'] = () => true;
export const GAMEPAD_INSPECTION_INPUT_SCOPE: InputScope = Object.freeze({
  id: 'gamepad-test-capture',
  priority: INPUT_SCOPE_PRIORITY.testCapture,
  modalities: ['gamepad'] as const,
  exclusive: true,
  handle: captureGamepadInspectionInput,
});

type TestedState = {
  buttons: boolean[];
  buttonPeaks: number[];
  axes: boolean[];
  axisPeaks: number[];
};

function emptyTestedState(): TestedState {
  return {
    buttons: [],
    buttonPeaks: [],
    axes: [],
    axisPeaks: [],
  };
}

function updateTestedState(
  current: TestedState,
  snapshot: GamepadInputSnapshot,
) {
  const buttons = [...current.buttons];
  const buttonPeaks = [...current.buttonPeaks];
  snapshot.buttons.forEach((value, index) => {
    buttonPeaks[index] = Math.max(buttonPeaks[index] ?? 0, value);
    if (value >= (index === 6 || index === 7 ? 0.1 : 0.5)) {
      buttons[index] = true;
    }
  });
  const axes = [...current.axes];
  const axisPeaks = [...current.axisPeaks];
  snapshot.axes.forEach((value, index) => {
    axisPeaks[index] = Math.max(axisPeaks[index] ?? 0, Math.abs(value));
    if (Math.abs(value) >= 0.2) axes[index] = true;
  });
  return { buttons, buttonPeaks, axes, axisPeaks };
}

function percentage(value: number | undefined) {
  return `${Math.round(Math.max(0, Math.min(1, value ?? 0)) * 100)}%`;
}

const stickTelemetry = [
  { label: '左摇杆', shortLabel: 'L3', indices: [0, 1] as const },
  { label: '右摇杆', shortLabel: 'R3', indices: [2, 3] as const },
] as const;

const triggerTelemetry = [
  { label: 'L2', index: 6, side: 'left' },
  { label: 'R2', index: 7, side: 'right' },
] as const;

export function GamepadInspection({
  visible,
  active,
  onExit,
}: {
  visible: boolean;
  active: boolean;
  onExit: () => void;
}) {
  const snapshot = useGamepadSnapshot();
  const captureRef = useRef<HTMLElement>(null);
  const artworkRef = useRef<HTMLDivElement>(null);
  const snapshotRef = useRef(snapshot);
  const exitGestureRef = useRef(new GamepadExitGestureTracker());
  const [exitProgress, setExitProgress] = useState(0);
  const [tested, setTested] = useState<TestedState>(emptyTestedState);
  const [artworkError, setArtworkError] = useState('');
  const [artworkRetry, setArtworkRetry] = useState(0);
  const testedRef = useRef(tested);
  const profile = useMemo(() => controllerProfile(snapshot.id), [snapshot.id]);
  snapshotRef.current = snapshot;
  testedRef.current = tested;

  useEffect(() => {
    if (!active || !snapshot.connected) return;
    setTested((current) => updateTestedState(current, snapshot));
  }, [active, snapshot]);

  useEffect(() => {
    if (!active) {
      setExitProgress(0);
      setTested(emptyTestedState());
      exitGestureRef.current.reset();
      return;
    }
    setTested(emptyTestedState());
  }, [active]);

  useLayoutEffect(() => {
    if (!active) return;
    const capture = captureRef.current;
    if (!capture) return;
    const rootNode = capture.getRootNode();
    const root =
      rootNode instanceof ShadowRoot ? rootNode : capture.ownerDocument;
    return inputCoordinatorFor(root).register(
      root,
      GAMEPAD_INSPECTION_INPUT_SCOPE,
    );
  }, [active]);

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const tick = (now: number) => {
      const result = exitGestureRef.current.update(snapshotRef.current, now);
      setExitProgress(result.progress);
      if (result.complete) {
        onExit();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      exitGestureRef.current.reset();
    };
  }, [active, onExit]);

  useLayoutEffect(() => {
    void artworkRetry;
    const root = artworkRef.current;
    if (!root) return;
    let mounted = true;
    setArtworkError('');
    void createControllerSvg({
      kind: profile.kind,
      url: projectAssetUrl(controllerArtworkPath(profile.kind)),
      ownerDocument: root.ownerDocument,
    }).then(
      (svg) => {
        if (!mounted) return;
        root.replaceChildren(svg);
        applyControllerSnapshot(
          root,
          snapshotRef.current,
          profile,
          testedRef.current,
        );
      },
      (failure) => {
        if (!mounted) return;
        root.replaceChildren();
        setArtworkError(
          failure instanceof Error ? failure.message : String(failure),
        );
      },
    );
    return () => {
      mounted = false;
    };
  }, [artworkRetry, profile]);

  useLayoutEffect(() => {
    const root = artworkRef.current;
    if (!root?.querySelector('svg')) return;
    applyControllerSnapshot(root, snapshot, profile, tested);
  }, [profile, snapshot, tested]);

  return (
    <section
      ref={captureRef}
      className={`gamepad-inspection-stage${visible ? ' is-visible' : ''}${active ? ' is-active' : ' is-preview'}`}
      aria-label="手柄输入检查"
      aria-hidden={!visible}
      data-controller-kind={profile.kind}
    >
      <div className="gamepad-test">
        <div className="gamepad-test__body">
          <div className="gamepad-test__visual">
            <button
              type="button"
              className="gamepad-test__clear"
              title="清除验证记录"
              aria-label="清除手柄验证记录"
              onClick={() => setTested(emptyTestedState())}
            >
              <Eraser size={15} aria-hidden="true" />
            </button>
            {triggerTelemetry.map(({ label, index, side }) => (
              <div
                key={label}
                className={`gamepad-test__trigger gamepad-test__trigger--${side}${(snapshot.buttons[index] ?? 0) >= 0.08 ? ' is-active' : ''}`}
              >
                <header>
                  <strong>{label}</strong>
                  <b>{percentage(snapshot.buttons[index])}</b>
                </header>
                <span
                  className="gamepad-test__trigger-meter"
                  aria-hidden="true"
                >
                  <i
                    style={{
                      transform: `scaleY(${snapshot.buttons[index] ?? 0})`,
                    }}
                  />
                </span>
                <small>峰值 {percentage(tested.buttonPeaks[index])}</small>
              </div>
            ))}

            <div ref={artworkRef} className="gamepad-test__artwork" />
            {artworkError && (
              <UiNotice tone="error" title="手柄图形载入失败">
                <p>{artworkError}</p>
                <UiButton onClick={() => setArtworkRetry((value) => value + 1)}>
                  重新载入
                </UiButton>
              </UiNotice>
            )}

            <div className="gamepad-test__sticks">
              {stickTelemetry.map((stick) => {
                const stickStrength = Math.hypot(
                  snapshot.axes[stick.indices[0]] ?? 0,
                  snapshot.axes[stick.indices[1]] ?? 0,
                );
                return (
                  <div
                    key={stick.label}
                    className={`gamepad-test__metric gamepad-test__metric--stick${stickStrength >= 0.12 ? ' is-active' : ''}`}
                  >
                    <header>
                      <strong>{stick.shortLabel}</strong>
                      <b>{stickStrength.toFixed(2)}</b>
                    </header>
                    <div className="gamepad-test__axis-values">
                      <span>
                        X {(snapshot.axes[stick.indices[0]] ?? 0).toFixed(2)}
                      </span>
                      <span>
                        Y {(snapshot.axes[stick.indices[1]] ?? 0).toFixed(2)}
                      </span>
                    </div>
                    <small>
                      峰值{' '}
                      {Math.max(
                        tested.axisPeaks[stick.indices[0]] ?? 0,
                        tested.axisPeaks[stick.indices[1]] ?? 0,
                      ).toFixed(2)}
                    </small>
                  </div>
                );
              })}
            </div>

            <footer className="gamepad-test__exit" aria-hidden={!active}>
              <div>
                <strong>退出检查</strong>
                <span>双摇杆大致向下并向内，保持片刻</span>
              </div>
              <span className="gamepad-test__exit-progress" aria-hidden="true">
                <i
                  className="gamepad-test__exit-fill"
                  style={{ transform: `scaleX(${exitProgress})` }}
                />
              </span>
              <b>{Math.round(exitProgress * 100)}%</b>
            </footer>

            <div className="gamepad-test__status">
              <span className={snapshot.connected ? 'is-connected' : undefined}>
                <i className="gamepad-test__status-dot" aria-hidden="true" />
                {snapshot.connected
                  ? snapshot.id || '标准映射手柄'
                  : '等待手柄输入'}
              </span>
              <div className="gamepad-test__legend">
                <span className="is-active">
                  <i aria-hidden="true" />
                  正在触发
                </span>
                <span className="is-tested">
                  <i aria-hidden="true" />
                  已验证
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
