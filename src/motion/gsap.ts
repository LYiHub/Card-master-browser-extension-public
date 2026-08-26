import { gsap as greenSock } from 'gsap';

import { observeReducedMotion } from './preference';

export const REDUCED_MOTION_GSAP_TIME_SCALE = 4;

export function gsapTimeScaleForPreference(reducedMotion: boolean) {
  return reducedMotion ? REDUCED_MOTION_GSAP_TIME_SCALE : 1;
}

function syncMotionPreference(reducedMotion: boolean) {
  greenSock.globalTimeline.timeScale(gsapTimeScaleForPreference(reducedMotion));
}

observeReducedMotion(syncMotionPreference);

export { greenSock as gsap };
