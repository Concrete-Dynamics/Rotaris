let storedSetting: boolean | undefined;

export function setStoredMotionPreference(value: boolean | undefined): void { storedSetting = value; }

/** REQ-SHELL-135: stored choice, live OS signal, then motion on. */
export function motionReduced(): boolean {
  if (storedSetting !== undefined) return storedSetting;
  try { return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false; }
  catch { return false; }
}

/** Called as an animation begins; CSS uses this marker to collapse travel and timers. */
export function markMotionStart(element: HTMLElement): boolean {
  const reduced = motionReduced();
  element.dataset['motion'] = reduced ? 'reduced' : 'full';
  return reduced;
}
