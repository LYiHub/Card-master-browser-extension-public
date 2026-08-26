import { type CSSProperties, forwardRef, useEffect, useRef } from 'react';

import { CardMetadataCopy } from '../../components/CardMetadataCopy';
import { UiLoader } from '../../components/ui/Ui';
import { CardMaterialLayers } from '../../features/manager-interaction/CardMaterialLayers';

export type InstallCardAssets = {
  back: string;
  bottomFrame: string;
  edge: string;
  sparkles: string;
  media:
    | {
        kind: 'video';
        video: string;
        poster?: string;
      }
    | {
        kind: 'image';
        image: string;
      };
};

export const InstallScriptCard = forwardRef<
  HTMLDivElement,
  {
    assets: InstallCardAssets;
    name: string;
    description: string;
    playing: boolean;
    waiting?: boolean;
    status: 'ready' | 'error';
    accent?: string;
  }
>(function InstallScriptCard(
  { assets, name, description, playing, waiting = false, status, accent },
  ref,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shouldPlay = assets.media.kind === 'video' && playing;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (shouldPlay) {
      video.muted = true;
      video.currentTime = 0;
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [shouldPlay]);

  return (
    <div
      className="install-card-stage"
      style={
        accent ? ({ '--manager-accent': accent } as CSSProperties) : undefined
      }
      aria-hidden="true"
    >
      <div ref={ref} className="install-card-motion">
        <div className="install-card-idle">
          <div className="install-card-tilt" data-card-local-tilt>
            <div className="install-card">
              <div className="install-card__front">
                <div className="install-card__surface">
                  {assets.media.kind === 'video' ? (
                    <video
                      ref={videoRef}
                      src={assets.media.video}
                      poster={assets.media.poster}
                      autoPlay={shouldPlay}
                      loop
                      muted
                      playsInline
                      preload="auto"
                    />
                  ) : (
                    <img src={assets.media.image} alt="" />
                  )}
                  <CardMaterialLayers
                    edgeUrl={assets.edge}
                    finish="holographic"
                    sparklesUrl={assets.sparkles}
                    showSparkles={status !== 'error'}
                  />
                  <CardMetadataCopy
                    className="install-card-identity"
                    name={name}
                    description={description}
                  />
                </div>
                <img
                  className="install-card-bottom"
                  src={assets.bottomFrame}
                  alt=""
                />
              </div>
              <div className="install-card__back">
                <img src={assets.back} alt="" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="install-card-reflection" />
      {waiting && (
        <div className="install-card-wait">
          <UiLoader compact label="正在写入牌库" />
        </div>
      )}
    </div>
  );
});
