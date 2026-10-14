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
/** REQ-LIBRARY-022's note when the answer and its retry could not be parsed: the pass got no usable answer. */
const PARSE_FAILED = /^collector parse failed: /;
const escaped = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * What a pass left, read from its artifact and the notice on screen when the capture ended (`notices`: the
 * `[data-testid="notice"]` probe's rows). `outcome` is `proposals` (REQ-LIBRARY-124's success notice), `timed-out` (the
 * empty artifact REQ-LIBRARY-023's timeout writes: the info notice, its detail naming the limit — PD-CONFIG-003 revision 2's
 * for the post-run pass, PD-LIBRARY-005's "The retrospective reached its <t>-second limit" for the retrospective),
 * `crashed` (the empty artifact REQ-LIBRARY-023 writes for any other crash) and `parse-failed` (REQ-LIBRARY-022's, the answer
 * unreadable twice) — each owing PD-LIBRARY-005's failure warning, its pass's title with the artifact's id in its detail and
 * no zero-proposal title beside it — `empty` (no proposal for another reason) or `none` (no artifact at all).
 * `noticeMatches` says whether the notice on screen is the one the outcome owes, and is null where the outcome owes none.
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
  const title = retrospective ? /The retrospective found nothing to propose/ : /Improvement analysis complete — no proposals/;
  /*
   * A crashed collector (REQ-LIBRARY-023's "collector crashed: <exc>") never reached the model, and one whose answer could not
   * be parsed (REQ-LIBRARY-022) got no usable answer: PD-LIBRARY-005 (OQ-285) gives both the pass's failure warning, naming the
   * artifact that holds no proposals. The live run at ce5f952 (F4) PASSed the retrospective's checks over "collector crashed:
   * Unauthorized" with "The retrospective found nothing to propose" on screen; that notice no longer matches either outcome.
   */
  const failed = CRASHED.test(notes ?? '') ? 'crashed' : PARSE_FAILED.test(notes ?? '') ? 'parse-failed' : null;
  if (failed !== null) {
    const warning = retrospective ? /The retrospective could not be completed/ : /The completed run could not be reviewed for improvements/;
    // The artifact is named at the END of the detail, after the reason, which can be long (a parse failure quotes the
    // validator's issues as JSON): the capture's probe keeps a long text's tail for this reading (`PROBE_TEXT` in
    // `src/main/capture/probe.ts`; until fin46 it cut at 400 characters, and the b9e3005 live run read "… holds no proposa").
    const named = new RegExp(`${escaped(artifact.artifact_id ?? '')} holds no proposals`);
    const noticeMatches = texts.some((t) => warning.test(t) && named.test(t)) && !has(title);
    return { outcome: failed, ...(failed === 'crashed' ? { crashed: true } : {}), proposals, notes, noticeMatches };
  }
  const limit = TIMED_OUT.exec(notes ?? '');
  if (limit !== null) {
    const detail = retrospective ? new RegExp(`The retrospective reached its ${escaped(limit[1])}-second limit before it proposed anything`) : new RegExp(`reached its ${escaped(limit[1])}-second limit`);
    return { outcome: 'timed-out', proposals, notes, limitS: Number(limit[1]), noticeMatches: texts.some((t) => title.test(t) && detail.test(t)) };
  }
  return { outcome: 'empty', proposals, notes, noticeMatches: has(title) };
}

/**
 * The live `ask` scenario's verdict on its run's post-run analysis, from the artifacts stored for that session (`count`) and
 * `passOutcome`'s reading of the newest: one artifact with proposals or with the timed-out notes is `pass`; one with no
 * proposal for another reason is a `note`, since an analyst that finds nothing to propose over a one-file run is the model's
 * judgement and REQ-LIBRARY-124 gives that outcome its own notice ("Improvement analysis complete — no proposals"); so is an
 * answer the model gave twice in a shape the parser could not read (`parse-failed`, REQ-LIBRARY-022): the model's, not the
 * product's, and PD-LIBRARY-005 gives it the failure warning. A crashed collector (`crashed`) never reached the model — the live
 * run at ce5f952's 401 (F2) — and is `fail`, as are no artifact and more than one for the one run. The notice is checked apart,
 * for whichever outcome stands.
 */
export function postRunVerdict(count, outcome) {
  if (count !== 1) return 'fail';
  if (outcome?.outcome === 'proposals' || outcome?.outcome === 'timed-out') return 'pass';
  return outcome?.outcome === 'empty' || outcome?.outcome === 'parse-failed' ? 'note' : 'fail';
}

/**
 * The live `ask-retrospective` scenario's artifact check (fin43's F4 repair, held under PD-LIBRARY-005): exactly one
 * retrospective artifact, belonging to no session (PD-LIBRARY-002 revision 2 (a)), having read the `ask` session, and its
 * collector not crashed. A crashed collector never reached the model — at ce5f952 the 401 of a request sent with no credential
 * (F2) — so the artifact check fails on it whatever notice the pass then posted; PD-LIBRARY-005's warning is checked apart, by
 * `passOutcome`'s `noticeMatches`. `rows` are the store's retrospective rows (`{ artifact_id, source_session_id, artifact }`),
 * `outcome` is `passOutcome`'s reading of the first. Returns `{ passed, detail }`.
 */
export function retrospectiveArtifactVerdict(rows, askSessionId, outcome) {
  const list = rows ?? [];
  const first = list[0];
  const passed = list.length === 1 && first.source_session_id === null && (first.artifact?.considered_session_ids ?? []).includes(askSessionId) && outcome?.outcome !== 'crashed';
  const detail = list.map((a) => `${a.artifact_id}: ${outcome?.outcome}, ${outcome?.proposals} proposal(s), considered ${JSON.stringify(a.artifact?.considered_session_ids ?? [])}, notes ${JSON.stringify(a.artifact?.notes ?? null)}`).join(' | ') || 'none stored';
  return { passed, detail };
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


/** PD-LIBRARY-002 revision 5 (OQ-300): the retrospective's authentication refusal, as main posts it at capture. */
export const RETROSPECTIVE_AUTH_HEADLINE = 'Provider authentication required';
export const RETROSPECTIVE_AUTH_DETAIL = 'Authenticate at least one configured provider before running a retrospective.';
export const RETROSPECTIVE_AUTH_ACTION = 'Open Models settings';

/** The capture's wait for `ask-retrospective-unauth`: a notice on screen naming the refusal's headline. */
export function refusalWait() {
  return `js:[...document.querySelectorAll('[data-testid="notice"]')].some((n) => (n.textContent || '').includes(${JSON.stringify(RETROSPECTIVE_AUTH_HEADLINE)}))`;
}

/**
 * PD-LIBRARY-002 revision 5 (OQ-300), the live run's `ask-retrospective-unauth`: a retrospective pressed with the entry
 * provider's credential withheld owes ONE notice titled with REQ-WORKSPACE-137's headline, the retrospective's sentence as its
 * body and the "Open Models settings" action, and stores no retrospective artifact. `notices` are the capture's probe of
 * `[data-testid="notice"]` (each `{ text }`); `artifactsBefore` and `artifactsAfter` count the retrospective artifacts.
 */
export function retrospectiveRefusalVerdict(notices, artifactsBefore, artifactsAfter) {
  const texts = (notices ?? []).map((n) => String(n?.text ?? ''));
  const refusals = texts.filter((t) => t.includes(RETROSPECTIVE_AUTH_HEADLINE));
  const one = refusals.length === 1 ? refusals[0] : null;
  const worded = one !== null && one.includes(RETROSPECTIVE_AUTH_DETAIL) && !one.includes(`${RETROSPECTIVE_AUTH_DETAIL}.`);
  const actioned = one !== null && one.includes(RETROSPECTIVE_AUTH_ACTION);
  const generic = texts.some((t) => t.includes('The retrospective could not be started'));
  const queued = artifactsAfter - artifactsBefore;
  const passed = one !== null && worded && actioned && !generic && queued === 0;
  const detail = `${refusals.length} refusal notice(s)${one === null ? '' : `, worded ${worded}, action ${actioned}`}${generic ? ', and the generic "could not be started" notice' : ''}; ${queued} retrospective artifact(s) stored by the press`;
  return { passed, detail, refusals: refusals.length, worded, actioned, queued };
}
