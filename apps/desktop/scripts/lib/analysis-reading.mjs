/**
 * The live run's reading of the two improvement passes it lets finish (fin42; the 2026-10-13 survey's N58): the per-run
 * analyst (REQ-LIBRARY-123/124/125/127) after the `ask` scenario's run, and the retrospective (PD-LIBRARY-002) its follow-on
 * launch starts from the Library's gesture. Until fin42 every scenario quit 2.5 to 6 s after its run's result, which
 * cancelled the analysis by design (REQ-LIBRARY-127), so no pass had ever finished against a real model and the packs held
 * no improvement artifact.
 *
 * Pure, verification only: `settledWait` is the capture's `js:` wait, the rest read rows the caller selected.
 */

/** The title-bar indicator (REQ-LIBRARY-125), which names its pass in `data-pass`. */
export const INDICATOR = '[data-testid="improvement-activity-title-bar"]';

/**
 * `ROTARIS_CAPTURE_WAIT` for "the `pass` analysis was seen running and has ended": the indicator naming that pass must have
 * been on screen at one poll (500 ms apart; a real analysis runs for seconds), and no indicator stands now. Remembered on
 * the renderer's `window`, since each poll evaluates the expression afresh.
 */
export function settledWait(pass) {
  if (pass !== 'post_run' && pass !== 'retrospective') throw new Error(`an improvement pass is post_run or retrospective: ${pass}`);
  return `js:(() => { const t = document.querySelector(${JSON.stringify(INDICATOR)}); if (t !== null && t.getAttribute('data-pass') === ${JSON.stringify(pass)}) window.__rotarisSeenPass = ${JSON.stringify(pass)}; return window.__rotarisSeenPass === ${JSON.stringify(pass)} && t === null; })()`;
}

/** How long the capture waited for `settledWait`, from its own log line; null when the wait never held. */
export function settledAfterMs(log) {
  const m = /capture: wait for js:.*? satisfied after (\d+) ms/.exec(String(log));
  return m ? Number(m[1]) : null;
}

const TIMED_OUT = /^collector timed out after (\d+(?:\.\d+)?) seconds\b/;
/** REQ-LIBRARY-023's note for any other crash of the collector: the pass never reached an answer from the model. */
const CRASHED = /^collector crashed: /;

/**
 * What a pass left, read from its artifact and the notice on screen when the capture ended (`notices`: the
 * `[data-testid="notice"]` probe's rows). `outcome` is `proposals` (REQ-LIBRARY-124's success notice), `timed-out` (the
 * empty artifact REQ-LIBRARY-023's timeout writes, with REQ-NOTIFY-100's detail naming the limit), `crashed` (the empty
 * artifact REQ-LIBRARY-023 writes for any other crash, which no notice matches), `empty` (no proposal for another reason) or
 * `none` (no artifact at all). `noticeMatches` says whether the notice on screen is the one the outcome
 * owes, and is null where the outcome owes none.
 */
export function passOutcome(artifact, notices, { retrospective = false } = {}) {
  if (artifact === null || artifact === undefined) return { outcome: 'none', proposals: 0, notes: null, noticeMatches: null };
  const proposals = (artifact.proposals ?? []).length;
  const notes = artifact.notes ?? null;
  const texts = (notices ?? []).map((n) => String(n?.text ?? ''));
  const has = (pattern) => texts.some((t) => pattern.test(t));
  if (proposals > 0) {
    const title = retrospective ? new RegExp(`${proposals} retrospective proposals? ready`) : new RegExp(`${proposals} improvement proposals? ready`);
    return { outcome: 'proposals', proposals, notes, noticeMatches: has(title) };
  }
  /*
   * A crashed collector (REQ-LIBRARY-023's "collector crashed: <exc>") is no outcome a pass owes: it never reached the model.
   * No notice matches it — which notice it does owe is OQ-285's — so the notice check fails on it, and so does the artifact
   * check that reads `crashed` (the live run at ce5f952, F4: both PASSed "collector crashed: Unauthorized").
   */
  if (CRASHED.test(notes ?? '')) return { outcome: 'crashed', crashed: true, proposals, notes, noticeMatches: false };
  const limit = TIMED_OUT.exec(notes ?? '');
  const title = retrospective ? /The retrospective found nothing to propose/ : /Improvement analysis complete — no proposals/;
  if (limit !== null) {
    const detail = retrospective ? /Nothing was proposed in/ : new RegExp(`reached its ${limit[1]}-second limit`);
    return { outcome: 'timed-out', proposals, notes, limitS: Number(limit[1]), noticeMatches: texts.some((t) => title.test(t) && detail.test(t)) };
  }
  return { outcome: 'empty', proposals, notes, noticeMatches: has(title) };
}

/**
 * The live `ask` scenario's verdict on its run's post-run analysis, from the artifacts stored for that session (`count`) and
 * `passOutcome`'s reading of the newest: one artifact with proposals or with the timed-out notes is `pass`; one with no
 * proposal for another reason is a `note`, since an analyst that finds nothing to propose over a one-file run is the model's
 * judgement and REQ-LIBRARY-124 gives that outcome its own notice ("Improvement analysis complete — no proposals"); no
 * artifact, or more than one for the one run, is `fail`. The notice is checked apart, for whichever outcome stands.
 */
export function postRunVerdict(count, outcome) {
  if (count !== 1) return 'fail';
  if (outcome?.outcome === 'proposals' || outcome?.outcome === 'timed-out') return 'pass';
  return outcome?.outcome === 'empty' ? 'note' : 'fail';
}

/**
 * PD-LIBRARY-002 revision 2 (OQ-235): the run host's line naming the instruction files a retrospective was handed —
 * "retrospective: <n> of <m> enabled instruction file(s) at the workspace root (<ids>)" — and whether every id it lists is
 * a workspace-root one (`workspace:`). Null when the log holds no such line.
 */
export function retrospectiveInstructionFiles(log) {
  const m = /retrospective: (\d+) of (\d+) enabled instruction file\(s\) at the workspace root(?: \(([^)]*)\))?/.exec(String(log));
  if (m === null) return null;
  const ids = (m[3] ?? '').split(',').map((s) => s.trim()).filter((s) => s !== '');
  return { handed: Number(m[1]), enabled: Number(m[2]), ids, rootOnly: ids.every((id) => id.startsWith('workspace:')) && ids.length === Number(m[1]) };
}

/**
 * The run host's model requests that went out with no credential — its `onRequest` line, "model request POST <url> (no
 * authorization header)" (`run-host/host.ts`). The live run at ce5f952 (F2) found the retrospective's one request so.
 */
export function unauthorizedRequests(log) {
  return [...String(log).matchAll(/run host: model request \S+ \S+ \(no authorization header\)/g)].length;
}

/**
 * The runs a launch started, from the run host's "session <id> started" line. `ask-retrospective` owes none before its gesture:
 * a retrospective in a launch no run has leased in is the shape that exposed F2 (the live run at ce5f952), and a run started
 * first would lease the bearer for it and hide a retrospective that leases nothing itself.
 */
export function runsStarted(log) {
  return [...String(log).matchAll(/run host: session \S+ started; /g)].length;
}

