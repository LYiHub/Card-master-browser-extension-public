import { type CSSProperties, useEffect, useMemo, useState } from 'react';

import { classNames } from '../../lib/class-names';
import { usePageVisible } from '../../lib/page-visibility';
import { projectAssetUrl } from '../../lib/project-assets';
import { prefersReducedMotion } from '../../motion/preference';

export const FLAME_SEQUENCE_IDS = [
  '01',
  '02',
  '03',
  '04',
  '06',
  '07',
  '10',
] as const;
export type FlameSequenceId = (typeof FLAME_SEQUENCE_IDS)[number];

const FRAME_COUNT = 12;
const STATIC_FRAME_INDEX = Math.floor(FRAME_COUNT / 2);
let nextSequenceIndex = 0;

export function nextFlameSequenceId() {
  const sequence =
    FLAME_SEQUENCE_IDS[nextSequenceIndex % FLAME_SEQUENCE_IDS.length] ?? '01';
  nextSequenceIndex = (nextSequenceIndex + 1) % FLAME_SEQUENCE_IDS.length;
  return sequence;
}

export function FlameSequence({
  sequence,
  className,
  frameDuration = 84,
  animated = true,
  style,
}: {
  sequence: FlameSequenceId;
  className?: string;
  frameDuration?: number;
  animated?: boolean;
  style?: CSSProperties;
}) {
  const pageVisible = usePageVisible();
  const frames = useMemo(
    () =>
      Array.from({ length: FRAME_COUNT }, (_, index) =>
        projectAssetUrl(
          `userscript-deck/visual/ui/flame-sequences/${sequence}/${String(
            index + 1,
          ).padStart(2, '0')}.webp`,
        ),
      ),
    [sequence],
  );
  const [frameIndex, setFrameIndex] = useState(
    animated ? 0 : STATIC_FRAME_INDEX,
  );

  useEffect(() => {
    for (const source of frames) {
      const image = new Image();
      image.src = source;
    }
  }, [frames]);

  useEffect(() => {
    if (!animated || !pageVisible || prefersReducedMotion()) {
      setFrameIndex(STATIC_FRAME_INDEX);
      return;
    }

    let animationFrame = 0;
    let previousFrame = -1;
    const startedAt = performance.now();
    const update = (timestamp: number) => {
      const nextFrame =
        Math.floor((timestamp - startedAt) / frameDuration) % frames.length;
      if (nextFrame !== previousFrame) {
        previousFrame = nextFrame;
        setFrameIndex(nextFrame);
      }
      animationFrame = window.requestAnimationFrame(update);
    };
    animationFrame = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [animated, frameDuration, frames.length, pageVisible]);

  return (
    <img
      className={className}
      src={frames[frameIndex] ?? frames[0]}
      width="390"
      height="380"
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
      style={style}
    />
  );
}

export function LoadingFlame({
  className,
  size = 18,
}: {
  className?: string;
  size?: number;
}) {
  const [sequence] = useState(nextFlameSequenceId);
  return (
    <span
      className={classNames('app-ui-loading-flame', className)}
      style={
        {
          display: 'inline-grid',
          flex: '0 0 auto',
          width: `${size}px`,
          height: `${size}px`,
          lineHeight: 0,
          placeItems: 'center',
        } as CSSProperties
      }
      aria-hidden="true"
    >
      <FlameSequence
        sequence={sequence}
        style={{
          display: 'block',
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
      />
    </span>
  );
}
