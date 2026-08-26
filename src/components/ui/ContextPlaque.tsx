import { type ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { projectAssetUrl } from '../../lib/project-assets';
import { gsap } from '../../motion/gsap';

const DEFAULT_TOP_ORNAMENT = projectAssetUrl(
  'userscript-deck/visual/ui/interface/surfaces/plaque-top.webp',
);
const DEFAULT_BOTTOM_ORNAMENT = projectAssetUrl(
  'userscript-deck/visual/ui/interface/surfaces/plaque-bottom.webp',
);

export type ShortcutHint = {
  key: string;
  label: string;
};

export type ContextPlaqueContent = {
  key: string;
  title: string;
  description: string;
  stats: string[];
  shortcuts?: ShortcutHint[];
  tone?: 'neutral' | 'error';
};

export type ContextPlaqueTransition = 'animated' | 'immediate' | 'suspended';

export function shouldAnimateContextPlaqueTransition(
  transition: ContextPlaqueTransition,
) {
  return transition === 'animated';
}

export function AudioShortcutControl({
  muted,
  mutedIconUrl,
  activeIconUrl,
  onToggle,
}: {
  muted: boolean;
  mutedIconUrl: string;
  activeIconUrl: string;
  onToggle: () => void;
}) {
  const label = muted ? '开启声音' : '静音';
  return (
    <button
      type="button"
      className={`context-plaque__audio${muted ? ' is-muted' : ''}`}
      data-audio-managed="true"
      title={`${label}（M）`}
      aria-label={`${label}（M）`}
      aria-pressed={muted}
      onClick={onToggle}
    >
      <kbd>M</kbd>
      <img src={muted ? mutedIconUrl : activeIconUrl} alt="" />
      <span>{label}</span>
    </button>
  );
}

export function ContextPlaque({
  content,
  className = '',
  headingLevel = 'h2',
  transition = 'animated',
  topOrnamentUrl = DEFAULT_TOP_ORNAMENT,
  bottomOrnamentUrl = DEFAULT_BOTTOM_ORNAMENT,
  shortcutAction,
}: {
  content: ContextPlaqueContent;
  className?: string;
  headingLevel?: 'h1' | 'h2';
  transition?: ContextPlaqueTransition;
  topOrnamentUrl?: string;
  bottomOrnamentUrl?: string;
  shortcutAction?: ReactNode;
}) {
  const Heading = headingLevel;
  const contentRef = useRef<HTMLDivElement | null>(null);
  const copyRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const topOrnamentRef = useRef<HTMLDivElement | null>(null);
  const bottomOrnamentRef = useRef<HTMLDivElement | null>(null);
  const [rendered, setRendered] = useState(content);
  const renderedKeyRef = useRef(content.key);
  const transitioningKeyRef = useRef<string | null>(null);
  const latestContentRef = useRef(content);
  latestContentRef.current = content;

  useLayoutEffect(() => {
    if (
      renderedKeyRef.current === content.key &&
      transitioningKeyRef.current !== content.key
    ) {
      setRendered(content);
    }
  }, [content]);

  useLayoutEffect(() => {
    const body = contentRef.current;
    const copy = copyRef.current;
    const surface = surfaceRef.current;
    const topOrnament = topOrnamentRef.current;
    const bottomOrnament = bottomOrnamentRef.current;
    if (!body || !copy || !surface || !topOrnament || !bottomOrnament) {
      return;
    }
    const elements = [body, copy, surface, topOrnament, bottomOrnament];
    const normalizeVisualState = () => {
      gsap.set(body, { height: 'auto' });
      gsap.set(copy, { y: 0, opacity: 1 });
      gsap.set(surface, {
        scaleY: 1,
        transformOrigin: '50% 50%',
      });
      gsap.set([topOrnament, bottomOrnament], { y: 0, opacity: 1 });
    };
    gsap.killTweensOf(elements);
    if (transition === 'suspended') {
      normalizeVisualState();
      return;
    }

    const nextKey = content.key;
    const nextContent = latestContentRef.current;
    if (!shouldAnimateContextPlaqueTransition(transition)) {
      normalizeVisualState();
      transitioningKeyRef.current = null;
      renderedKeyRef.current = nextKey;
      setRendered(nextContent);
      return;
    }
    if (renderedKeyRef.current === nextKey) {
      normalizeVisualState();
      transitioningKeyRef.current = null;
      setRendered(nextContent);
      return;
    }
    renderedKeyRef.current = nextKey;
    transitioningKeyRef.current = nextKey;
    let nextHeight = body.getBoundingClientRect().height;
    const timeline = gsap
      .timeline()
      .to(
        copy,
        {
          opacity: 0,
          y: 5,
          duration: 0.18,
          ease: 'power2.in',
        },
        0,
      )
      .to(
        surface,
        {
          scaleY: 0.985,
          duration: 0.18,
          ease: 'power2.in',
          transformOrigin: '50% 50%',
        },
        0,
      )
      .to(
        topOrnament,
        {
          y: 3,
          opacity: 0.42,
          duration: 0.18,
          ease: 'power2.in',
        },
        0,
      )
      .to(
        bottomOrnament,
        {
          y: -3,
          opacity: 0.42,
          duration: 0.18,
          ease: 'power2.in',
        },
        0,
      )
      .add(() => {
        const previousHeight = body.getBoundingClientRect().height;
        const latest = latestContentRef.current;
        flushSync(() => {
          setRendered(latest.key === nextKey ? latest : nextContent);
        });
        gsap.set(body, { height: 'auto' });
        nextHeight = body.getBoundingClientRect().height;
        gsap.set(body, { height: previousHeight });
      }, 0.18)
      .set(copy, { y: -4 }, 0.18)
      .to(
        copy,
        {
          opacity: 1,
          y: 0,
          duration: 0.4,
          ease: 'power3.out',
        },
        0.18,
      )
      .to(
        body,
        {
          height: () => nextHeight,
          duration: 0.4,
          ease: 'power3.inOut',
        },
        0.18,
      )
      .to(
        surface,
        {
          scaleY: 1.012,
          duration: 0.28,
          ease: 'power3.out',
        },
        0.18,
      )
      .to(
        topOrnament,
        {
          y: -5,
          opacity: 1,
          duration: 0.28,
          ease: 'power3.out',
        },
        0.18,
      )
      .to(
        bottomOrnament,
        {
          y: 5,
          opacity: 1,
          duration: 0.28,
          ease: 'power3.out',
        },
        0.18,
      )
      .to(
        surface,
        {
          scaleY: 1,
          duration: 0.14,
          ease: 'sine.out',
        },
        0.46,
      )
      .to(
        [topOrnament, bottomOrnament],
        {
          y: 0,
          duration: 0.14,
          ease: 'sine.out',
        },
        0.46,
      )
      .set(body, { height: 'auto' }, 0.6)
      .add(() => {
        if (transitioningKeyRef.current !== nextKey) return;
        transitioningKeyRef.current = null;
        const latest = latestContentRef.current;
        if (latest.key === nextKey) setRendered(latest);
      });
    return () => {
      timeline.kill();
      if (transitioningKeyRef.current === nextKey) {
        transitioningKeyRef.current = null;
      }
      gsap.killTweensOf(elements);
    };
  }, [content.key, transition]);

  const shortcuts = rendered.shortcuts ?? [];
  const error = rendered.tone === 'error';

  return (
    <section
      className={`context-plaque${error ? ' is-error' : ''}${className ? ` ${className}` : ''}`}
      aria-live={error ? 'assertive' : 'polite'}
      role={error ? 'alert' : undefined}
    >
      <div
        ref={topOrnamentRef}
        className="context-plaque__ornament context-plaque__ornament--top"
        aria-hidden="true"
      >
        <img
          className="context-plaque__ornament-layer is-neutral"
          src={topOrnamentUrl}
          alt=""
        />
        <img
          className="context-plaque__ornament-layer is-error"
          src={topOrnamentUrl}
          alt=""
        />
      </div>
      <div ref={contentRef} className="context-plaque__content">
        <div
          ref={surfaceRef}
          className="context-plaque__surface"
          aria-hidden="true"
        >
          <i className="context-plaque__surface-layer is-neutral" />
          <i className="context-plaque__surface-layer is-error" />
        </div>
        <div ref={copyRef} className="context-plaque__copy">
          <Heading className="context-plaque__title">{rendered.title}</Heading>
          <div className="context-plaque__rule" />
          <span className="context-plaque__description">
            {rendered.description}
          </span>
          {rendered.stats.length > 0 && (
            <div className="context-plaque__stats">
              {rendered.stats.map((stat) => (
                <b key={stat} className="context-plaque__stat">
                  {stat}
                </b>
              ))}
            </div>
          )}
          {shortcuts.length > 0 && (
            <div className="context-plaque__shortcuts">
              {shortcuts.map((shortcut) => (
                <span key={`${shortcut.key}:${shortcut.label}`}>
                  <kbd>{shortcut.key}</kbd>
                  {shortcut.label}
                </span>
              ))}
              {shortcutAction}
            </div>
          )}
        </div>
      </div>
      <div
        ref={bottomOrnamentRef}
        className="context-plaque__ornament context-plaque__ornament--bottom"
        aria-hidden="true"
      >
        <img
          className="context-plaque__ornament-layer is-neutral"
          src={bottomOrnamentUrl}
          alt=""
        />
        <img
          className="context-plaque__ornament-layer is-error"
          src={bottomOrnamentUrl}
          alt=""
        />
      </div>
    </section>
  );
}
