import { useEffect, useState } from 'react';

export type ViewportSize = {
  width: number;
  height: number;
};

function readViewportSize(): ViewportSize {
  return {
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
  };
}

export function useViewportSize() {
  const [viewport, setViewport] = useState(readViewportSize);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const next = readViewportSize();
        setViewport((current) =>
          current.width === next.width && current.height === next.height
            ? current
            : next,
        );
      });
    };
    window.addEventListener('resize', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('resize', update);
    };
  }, []);

  return viewport;
}
