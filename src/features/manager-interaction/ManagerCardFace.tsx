import { useEffect, useRef } from 'react';
import { useAudioSettings } from '../../audio/AudioDirectorProvider';
import { CardMetadataCopy } from '../../components/CardMetadataCopy';
import { usePageVisible } from '../../lib/page-visibility';
import { CardLockEffect, useCardLockPhase } from './CardLockEffect';
import { CardMaterialLayers } from './CardMaterialLayers';
import { CardStateBadge, type CardStateTone } from './CardStateBadge';
import {
  CARD_VIDEO_AUDIO_ATTACK_MS,
  CARD_VIDEO_AUDIO_HOVER_DELAY_MS,
  CARD_VIDEO_AUDIO_INTERACTION_RELEASE_MS,
  CARD_VIDEO_AUDIO_RELEASE_MS,
  monitorCardVideoVolume,
  rampCardVideoGain,
} from './card-video-audio';

export type ManagerCardMedia =
  | {
      kind: 'video';
      videoUrl: string;
      posterImageUrl?: string;
    }
  | {
      kind: 'image';
      imageUrl: string;
    };

type ManagerCardFaceProps = {
  active: boolean;
  enabled: boolean;
  playing: boolean;
  forge: boolean;
  showForgeMark?: boolean;
  modifiers?: readonly string[];
  media: ManagerCardMedia;
  edgeUrl: string;
  stateLabel: string | null;
  stateTone: CardStateTone;
  title: string;
  description: string;
  loadMedia?: boolean;
  preloadFrame?: boolean;
  resetPlayback?: boolean;
  videoAudio?: boolean;
  videoAudioActive?: boolean;
} & (
  | {
      finish: 'framed';
    }
  | {
      finish: 'holographic';
      sparklesUrl: string;
      showSparkles?: boolean;
    }
);

export function ManagerCardFace(props: ManagerCardFaceProps) {
  const {
    active,
    enabled,
    playing,
    forge,
    showForgeMark = true,
    modifiers = [],
    media,
    edgeUrl,
    stateLabel,
    stateTone,
    title,
    description,
    loadMedia = true,
    preloadFrame = false,
    resetPlayback = false,
    videoAudio = false,
    videoAudioActive = active,
  } = props;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoUrl = media.kind === 'video' ? media.videoUrl : '';
  const videoSourceRef = useRef(videoUrl);
  const videoAudioGainRef = useRef(0);
  const pageVisible = usePageVisible();
  const audioSettings = useAudioSettings();
  const { phase: lockPhase, completeTransition: completeLockTransition } =
    useCardLockPhase(enabled);
  const shouldPlay =
    media.kind === 'video' &&
    loadMedia &&
    enabled &&
    lockPhase === 'unlocked' &&
    playing &&
    pageVisible;
  const shouldPlayAudio =
    videoAudio && videoAudioActive && shouldPlay && !audioSettings.muted;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    let startTimer: number | null = null;
    let cancelGainRamp: () => void = () => undefined;
    let stopVolumeMonitor: () => void = () => undefined;
    const setAudioGain = (gain: number) => {
      videoAudioGainRef.current = gain;
    };
    const startVolumeMonitor = () => {
      stopVolumeMonitor();
      stopVolumeMonitor = monitorCardVideoVolume(
        video,
        audioSettings.volume,
        () => videoAudioGainRef.current,
      );
    };
    const pause = (reset = false) => {
      setAudioGain(0);
      video.muted = true;
      video.volume = 0;
      video.pause();
      if (reset) video.currentTime = 0;
    };
    const sourceChanged = videoSourceRef.current !== videoUrl;
    videoSourceRef.current = videoUrl;
    if (sourceChanged || resetPlayback) {
      pause(true);
      if (resetPlayback) return;
    }

    if (!shouldPlay) {
      if (
        !pageVisible ||
        !loadMedia ||
        !enabled ||
        video.paused ||
        video.muted ||
        videoAudioGainRef.current < 0.001
      ) {
        pause();
        return;
      }
      startVolumeMonitor();
      cancelGainRamp = rampCardVideoGain(
        videoAudioGainRef.current,
        0,
        CARD_VIDEO_AUDIO_RELEASE_MS,
        setAudioGain,
        pause,
      );
      return () => {
        cancelGainRamp();
        stopVolumeMonitor();
      };
    }

    const continuingAudiblePlayback =
      !video.paused && !video.muted && videoAudioGainRef.current > 0.001;
    const silenceWhilePlaying = () => {
      setAudioGain(0);
      video.muted = true;
      video.volume = 0;
    };
    if (!continuingAudiblePlayback) {
      silenceWhilePlaying();
    }
    void video.play().then(
      () => {
        if (cancelled) return;
        if (!shouldPlayAudio) {
          if (audioSettings.muted || !continuingAudiblePlayback) {
            silenceWhilePlaying();
            return;
          }
          startVolumeMonitor();
          cancelGainRamp = rampCardVideoGain(
            videoAudioGainRef.current,
            0,
            CARD_VIDEO_AUDIO_INTERACTION_RELEASE_MS,
            setAudioGain,
            () => {
              if (cancelled) return;
              stopVolumeMonitor();
              silenceWhilePlaying();
            },
          );
          return;
        }
        const beginFade = () => {
          if (cancelled) return;
          video.muted = false;
          startVolumeMonitor();
          cancelGainRamp = rampCardVideoGain(
            videoAudioGainRef.current,
            1,
            continuingAudiblePlayback
              ? CARD_VIDEO_AUDIO_RELEASE_MS
              : CARD_VIDEO_AUDIO_ATTACK_MS,
            setAudioGain,
          );
        };
        if (continuingAudiblePlayback) {
          beginFade();
        } else {
          startTimer = window.setTimeout(
            beginFade,
            CARD_VIDEO_AUDIO_HOVER_DELAY_MS,
          );
        }
      },
      () => undefined,
    );

    return () => {
      cancelled = true;
      if (startTimer !== null) window.clearTimeout(startTimer);
      cancelGainRamp();
      stopVolumeMonitor();
    };
  }, [
    audioSettings.muted,
    audioSettings.volume,
    enabled,
    loadMedia,
    pageVisible,
    resetPlayback,
    shouldPlay,
    shouldPlayAudio,
    videoUrl,
  ]);

  const modifierClassName =
    modifiers.length > 0 ? ` ${modifiers.join(' ')}` : '';

  return (
    <div
      className={`manager-card__face${active ? ' is-active' : ''}${enabled ? ' is-enabled' : ' is-sleeping'}${forge ? ' is-forge' : ''}${modifierClassName}`}
    >
      {media.kind === 'image' ? (
        <img
          className="manager-card__cover"
          src={media.imageUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
        />
      ) : (
        <video
          ref={videoRef}
          src={loadMedia ? videoUrl : undefined}
          poster={media.posterImageUrl}
          muted
          loop
          playsInline
          preload={loadMedia ? (preloadFrame ? 'auto' : 'metadata') : 'none'}
        />
      )}
      {props.finish === 'framed' ? (
        <CardMaterialLayers edgeUrl={edgeUrl} finish="framed" />
      ) : (
        <CardMaterialLayers
          edgeUrl={edgeUrl}
          finish="holographic"
          sparklesUrl={props.sparklesUrl}
          showSparkles={props.showSparkles ?? shouldPlay}
        />
      )}
      {stateLabel && <CardStateBadge label={stateLabel} tone={stateTone} />}
      {forge && showForgeMark && (
        <div className="manager-card__forge-mark">
          <i />
          <i />
          <i />
        </div>
      )}
      <CardLockEffect
        phase={lockPhase}
        active={playing}
        onTransitionComplete={completeLockTransition}
      />
      <CardMetadataCopy
        className="manager-card__identity"
        name={title}
        description={description}
      />
    </div>
  );
}
