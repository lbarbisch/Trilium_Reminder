/** Merge triggers that arrive together (for example resume and unlock). */
export function debounce(fn: () => void, windowMs = 3_000, now: () => number = Date.now) {
  let last = -Infinity;
  return (): void => {
    if (now() - last < windowMs) return;
    last = now();
    fn();
  };
}

/** Backup trigger: a timer that arrives far too late means the PC was asleep. */
export function watchForGaps(onWake: () => void, tickMs = 30_000, gapMs = 120_000) {
  let last = Date.now();
  return setInterval(() => {
    if (Date.now() - last > gapMs) onWake();
    last = Date.now();
  }, tickMs);
}
