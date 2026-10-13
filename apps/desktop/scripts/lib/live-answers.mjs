/**
 * What `slice-proof` accepts from a live model's answers, and only what a requirement fixes about them.
 *
 * A sampled model answers one prompt differently from run to run. A proof that asserts one fixed answer goes red on
 * the model's call and not on the product's. Against the registered self-hosted endpoint (`katalyst`), three of five
 * runs went red that way on 2026-10-03
 * (`docs/defects/fixed/slice-proof-reds-on-live-model-answers-that-vary-run-to-run.md`). What a requirement does fix
 * stays a red: the classifier's fallback (Part L; REQ-ORCH-007), a category outside the ones the taxonomy's texts leave
 * in reach of the prompt, and a run that never answers when it is given a second chance.
 */

/**
 * The intent scenario's prompts (scenario 3b), each with the categories REQ-ORCH-006 (the taxonomy, its two fixed
 * meanings, its tie-break) and REQ-ORCH-021 (the groups) leave in reach of it, and why. The classifier sees the prompt
 * and nothing of the workspace (REQ-ORCH-008), so what is in reach is read from the prompt alone.
 *
 * The tie-break ("when several categories are plausible the tie-break prefers `moderate_feature`") chooses among the
 * plausible categories: it never brings `moderate_feature` into reach of a prompt no build is plausible for. And
 * `explicit_trivial` is a small edit, so a request that changes nothing is out of its reach. Both are PD-ORCH-011's,
 * the owner's ruling of OQ-198 (R-071, 2026-10-06), which narrows REQ-ORCH-006.
 */
export const INTENTS = [
  {
    prompt: 'What is the first heading of README.md?',
    accept: ['question', 'exploration'],
    why: 'a question about one file that changes nothing. `question` and `exploration` are REQ-ORCH-021\'s answer group, and '
      + 'REQ-ORCH-006 fixes `exploration` as "investigate only", which reading one file to answer is. Out of reach: '
      + '`explicit_trivial` and `single_file_change` (PD-ORCH-011: `explicit_trivial` is a small edit, and with '
      + '`single_file_change` the micro group holds the two smallest edits; the prompt asks for none; run 4 of 2026-10-03 '
      + 'answered `explicit_trivial` at 0.99, which is a red since that ruling), `problem_resolution` (diagnose AND fix: '
      + 'nothing to fix), `refactor`, the build groups, and the clarify group (the prompt is neither ambiguous nor '
      + 'requirements work).',
  },
  {
    prompt: "Append the line 'hello' to the end of README.md.",
    accept: ['explicit_trivial', 'single_file_change'],
    why: 'one explicitly stated edit to one named file: REQ-ORCH-021\'s micro group. Out of reach: the answer group (it asks for '
      + 'a change), `problem_resolution` and `refactor` (nothing is broken or restructured), the build groups (no feature), '
      + 'and the clarify group (nothing is ambiguous).',
  },
  {
    prompt: 'Add a --json flag to the CLI that prints the effective configuration as JSON, with a unit test for it.',
    accept: ['small_feature', 'moderate_feature', 'large_feature'],
    why: 'a feature and its test: REQ-ORCH-021\'s small-, medium- and large-build groups, the size being the model\'s call since '
      + 'it sees no repository (REQ-ORCH-008); among them the tie-break prefers `moderate_feature`. Out of reach: '
      + '`architectural` and `whole_project` (one flag is neither the architecture nor the whole project), the micro group '
      + '(PD-ORCH-011 revision 2: `single_file_change` is a small edit confined to one file, and a change requested with a '
      + 'test of it is outside it unless the request places all of it in one file), the answer and fix groups, and the '
      + 'clarify group.',
  },
];

/** The run host's intent line: since PD-MONITOR-002 `… info    run host: intent: …`, before it `run host info: intent: …`. */
const INTENT_LINE = /\] info +run host: intent: |run host info: intent: /;

/**
 * What the intent line of one scenario-3b launch says, and the problem with it, if any: none written, the classifier's
 * fallback (REQ-ORCH-007; a timeout on REQ-ORCH-008's bound names OQ-114, whose ruling of 2026-10-06 keeps the 12 s bound),
 * or a category outside the prompt's `accept`.
 */
export function intentVerdict(log, intent) {
  const line = log.split('\n').find((l) => INTENT_LINE.test(l)) ?? '';
  const m = /intent: ([a-z_]+)(?: \(([^)]*)\))?(?: via (json_schema|json_object|text))?/.exec(line);
  const rungNotes = log.split('\n').filter((l) => /intent classifier: .* (rejected|answered) the/.test(l)).map((l) => l.replace(/^.*intent classifier: /, '').trim());
  if (!m) return { category: null, confidence: null, rung: null, rungNotes, problem: 'no intent line in the log' };
  const [, category, detail, rung] = m;
  const verdict = { category, confidence: detail ?? null, rung: rung ?? null, rungNotes };
  if (/fallback/.test(line)) {
    const bound = /timed out/.test(line) ? ' (REQ-ORCH-007\'s fallback at REQ-ORCH-008\'s bound, which OQ-114\'s ruling of 2026-10-06 keeps at 12 s for this release)' : '';
    return { ...verdict, problem: `the classifier fell back: ${line.trim()}${bound}` };
  }
  if (!intent.accept.includes(category)) return { ...verdict, outOfSet: true, problem: `"${intent.prompt}" classified as ${category}, outside what REQ-ORCH-006 and REQ-ORCH-021 leave in reach of it: ${intent.accept.join(', ')}` };
  return { ...verdict, problem: null };
}

/**
 * What scenario 3b does next for one prompt, from its verdicts so far (`intentVerdict`, one per launch): `done` with the
 * verdict that counts (and any `earlier` attempt), `again` to ask the prompt once more, or `red` with the problem.
 *
 * finacc3 A2-03 (`docs/defects/fixed/slice-proof-reds-on-one-intent-answer-outside-the-accepted-set.md`): r1 classified the
 * flag prompt `single_file_change (0.82)` and the lone re-run within the set at 0.95. One answer outside the set is the
 * sampled model's call, as one answerless run is (PD-ORCH-009): the prompt is asked once more, and a second answer outside
 * the set is the red, naming both. Since PD-ORCH-011 revision 2 (OQ-227, ruled 2026-10-13 under R-072) the classifier is
 * told on every rung that `single_file_change` is a small edit confined to one file and that a change requested with its
 * test is outside it; a model may still miss, and the one retry still absorbs a single sampled miss. Until then
 * REQ-ORCH-006 gave the category no meaning the classifier could be held to. A fallback (REQ-ORCH-007) and a missing intent
 * line are the product's and stay reds at once.
 */
export function intentOutcome(verdicts, intent) {
  const last = verdicts[verdicts.length - 1];
  const earlier = verdicts.slice(0, -1);
  if (last.problem === null) return { kind: 'done', verdict: last, earlier };
  if (last.outOfSet === true && verdicts.length === 1) return { kind: 'again' };
  if (last.outOfSet === true) {
    const said = verdicts.map((v) => `${v.category}${v.confidence === null ? '' : ` (${v.confidence})`}`).join(', then ');
    return { kind: 'red', problem: `"${intent.prompt}" classified outside what REQ-ORCH-006 and REQ-ORCH-021 leave in reach of it twice: ${said}; in reach: ${intent.accept.join(', ')}` };
  }
  return { kind: 'red', problem: last.problem };
}

/** An agent row that carries an answer: text beyond a fragment. */
export const answerRows = (rows) => rows.filter((r) => r.kind === 'agent' && r.body.length > 20);

/**
 * A run the product completed — `completed`, its terminal pair written — in which the model never wrote an answer.
 * REQ-ORCH-069 stops the run at `tasks_complete` once its tasks are done, and REQ-ORCH-115 skips the completion classifier
 * for the coordinator's report, so a model that ends its turn without text ends the run. Since OQ-199's ruling (R-071,
 * `PD-ORCH-009`) the product first asks the entry role once more, and tells the person when it still wrote none
 * (`toldNoAnswer`); a model silent twice is still the model's call. The proof reports it, keeps the attempt's evidence and
 * runs once more.
 */
export function answerlessCompletion(session, rows, events) {
  return session?.execution_status === 'completed'
    && events.some((e) => e.kind === 'result') && events.some((e) => e.kind === 'session.end')
    && answerRows(rows).length === 0;
}

/** PD-ORCH-009 (OQ-199 as ruled): the row that tells the person a run ended without an answer. */
export const NO_ANSWER_ROW = 'The run ended without an answer:';

/** PD-ORCH-009: whether the product told the person its run ended without an answer — a `system` row that says so. */
export const toldNoAnswer = (rows) => rows.some((r) => r.kind === 'system' && r.body.startsWith(NO_ANSWER_ROW));
