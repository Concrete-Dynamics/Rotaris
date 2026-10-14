/**
 * REQ-CHAT-158, REQ-MONITOR-107 (acceptance K1 of the default live run at `c2fdd6a`): at a run's end the run header and
 * the inspector's run-level row read one interval, `runStartedAt` to `updatedAt`, and must read it as one figure. They
 * did not: the header floored it and the row rounded it, so `edit` read "Completed 2:13" beside "2m 14s"
 * (`docs/defects/fixed/the-run-header-and-the-inspectors-run-level-row-read-one-run-duration-a-second-apart.md`).
 *
 * The live run probes `[data-testid="run-timing"]`, `[data-testid="inspector-name"]` and `[data-testid="inspector-meta"]`
 * at its capture, and this reads the three back from the launch log: the header's whole seconds from its `data-seconds`
 * and its text (`M:SS` or `H:MM:SS`), the row's from the meta line's elapsed figure (`Ns`, `Nm Ns`).
 */
export const DURATION_PROBES = Object.freeze(['[data-testid="run-timing"]', '[data-testid="inspector-name"]', '[data-testid="inspector-meta"]']);

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The first element a capture probe logged for `selector`, or null when the probe is absent or found nothing. */
export function probedElement(log, selector) {
  const line = new RegExp(`capture: probe ${escape(selector)} → (\\[.*\\])\\s*$`, 'm').exec(log)?.[1];
  if (line === undefined) return null;
  try { return JSON.parse(line)[0] ?? null; } catch { return null; }
}

/** `M:SS` / `H:MM:SS` → whole seconds, or null. */
export function headerSeconds(text) {
  const m = /(?:(\d+):)?(\d+):(\d{2})\s*$/.exec(String(text ?? '').trim());
  return m === null ? null : Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}
/** The meta line's elapsed figure (`<state> · 2m 13s · …`) → whole seconds, or null. */
export function rowSeconds(meta) {
  const m = /·\s*(?:(\d+)m\s+)?(\d+)s\s*(?:·|$)/.exec(String(meta ?? ''));
  return m === null ? null : Number(m[1] ?? 0) * 60 + Number(m[2]);
}

/**
 * The reading for one launch: `agree` true when the header's text, its `data-seconds` and the run-level row's elapsed
 * figure name one number of seconds; null fields when a probe found nothing (the caller says so rather than passing).
 */
export function runDurationReading(log, entryPersona) {
  const header = probedElement(log, DURATION_PROBES[0]);
  const name = probedElement(log, DURATION_PROBES[1])?.text ?? null;
  const meta = probedElement(log, DURATION_PROBES[2])?.text ?? null;
  const fromText = headerSeconds(header?.text);
  const fromData = header?.data?.['data-seconds'] === undefined || header.data['data-seconds'] === '' ? null : Number(header.data['data-seconds']);
  const row = rowSeconds(meta);
  const runLevel = name !== null && name === entryPersona;
  const agree = fromText !== null && row !== null && runLevel && fromText === row && (fromData === null || fromData === fromText);
  return { header: header?.text ?? null, frozen: header?.data?.['data-frozen'] ?? null, headerSeconds: fromText, dataSeconds: fromData, name, runLevel, meta, rowSeconds: row, agree };
}

/**
 * Whether the live run asserts the reading, notes it, or fails it (acceptance L4,
 * `docs/defects/fixed/the-k1-duration-check-is-asserted-on-a-run-that-never-reached-a-terminal-state.md`). The two figures
 * agree by design only once the run is terminal: while it is live the header counts the model call in flight, restarting
 * at each call (REQ-CHAT-158), and the run-level row counts from spawn (REQ-MONITOR-107). So the agreement is asserted only
 * when the header says it is frozen (`data-frozen` `1`); a header that is live, or carries no mark, is a NOTE with
 * `reason: 'not-terminal'`, as is a capture whose inspector shows another agent (`'another-agent'`). A probe that found
 * nothing is still a failure: the instrument did not read.
 */
export function runDurationVerdict(reading) {
  if (reading.header !== null && reading.frozen !== '1') return { verdict: 'note', reason: 'not-terminal' };
  if (reading.header !== null && reading.meta !== null && !reading.runLevel) return { verdict: 'note', reason: 'another-agent' };
  return { verdict: reading.agree ? 'pass' : 'fail' };
}
