import type { CSSProperties } from 'react';

export type CardBottomFrameFit = {
  width: number;
  bottomOutset: number;
};

export const CARD_BOTTOM_FRAME_SOURCE =
  '/project-assets/userscript-deck/visual/ui/card-frame/bottom-frame-square-gold.webp';

export const CARD_BOTTOM_FRAME_FIT: CardBottomFrameFit = {
  width: 104,
  bottomOutset: 4,
};

type FrameVariables = CSSProperties & {
  '--card-bottom-frame-aspect': string;
  '--card-bottom-frame-bottom': string;
  '--card-bottom-frame-scale': number;
  '--card-bottom-frame-image': string;
};

export function cardBottomFrameVariables(
  fit: CardBottomFrameFit = CARD_BOTTOM_FRAME_FIT,
  source = CARD_BOTTOM_FRAME_SOURCE,
): FrameVariables {
  return {
    '--card-bottom-frame-aspect': '525 / 363',
    '--card-bottom-frame-bottom': `${-fit.bottomOutset}%`,
    '--card-bottom-frame-scale': fit.width / 100,
    '--card-bottom-frame-image': `url(${JSON.stringify(source)})`,
  };
}

export function CardBottomFrame({
  className,
  imageClassName,
  fit,
  source = CARD_BOTTOM_FRAME_SOURCE,
  style,
}: {
  className: string;
  imageClassName: string;
  fit?: CardBottomFrameFit;
  source?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      className={className}
      style={{ ...cardBottomFrameVariables(fit, source), ...style }}
    >
      <img className={imageClassName} src={source} alt="" />
    </span>
  );
}
