/**
 * REQ-ORCH-139: a run names its timeline events "only from the timeline-event vocabulary … set out in Data & Formats, and
 * MUST NOT use any name outside those vocabularies". This gate reads every timeline write in the product's source —
 * `appendTimeline`, `appendTimelineEntry`, a timeline sink's `timeline`, the store's `insertTimeline` (its fourth argument),
 * the writer's `queuedMove` (its third) and main's `timeline.append` request — tests excluded, and fails on a name that is
 * in neither list below.
 *
 *   - VOCABULARY: every timeline name the specification fixes, each with the requirement that fixes it. Domain 01's list
 *     (Data & Formats, "Timeline event vocabulary") is read from `docs/spec/01-run-orchestration.md` as well, and a word
 *     there that is missing here fails the gate, so the two cannot drift.
 *   - FORBIDDEN: a name a requirement still states but a product directive withdrew, with the directive that governs; a
 *     write of it fails the gate (PD-TOOLS-002's `permission_mode_downgraded`).
 *   - AWAITING: the names the product writes that no list in `docs/spec/` or `docs/product/` has, each held by an open
 *     question until the owner rules on it. The list is closed: a new name fails the gate, and an entry the product no
 *     longer writes fails it too, so the list cannot outlive what it excuses. Empty since 2026-10-06, when the owner ruled
 *     OQ-157 with OQ-53, OQ-76 and OQ-127 (R-071): the twenty-eight names it held for OQ-157, and OQ-127's three, held
 *     here from the stall watch's build until that ruling, became words of `PD-ORCH-014` and `PD-CHAT-009`; with OQ-76's
 *     two, words of `PD-TOOLS-011`, VOCABULARY cites thirty-three, and the vocabulary is closed again.
 *
 * A name passed as a variable is accepted only where PASS_THROUGH names the file and the expression, each with its reason.
 * Acceptance finding A29 (2026-09-30) is why this exists:
 * docs/defects/fixed/the-run-writes-timeline-events-outside-its-closed-vocabulary.md.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

/** The specification's timeline names, each with the requirement that fixes it. */
export const VOCABULARY = {
  // Domain 01, Data & Formats, "Timeline event vocabulary" (REQ-ORCH-139).
  iteration_start: 'REQ-ORCH-139', iteration_end: 'REQ-ORCH-139', completion_classified: 'REQ-ORCH-139',
  completion_gate_decision: 'REQ-ORCH-139', repair_attempt_scheduled: 'REQ-ORCH-139', repair_escalation: 'REQ-ORCH-139',
  verifier_started: 'REQ-ORCH-139', verifier_check_started: 'REQ-ORCH-139', verifier_check_finished: 'REQ-ORCH-139',
  verifier_run_completed: 'REQ-ORCH-139', verifier_run_skipped: 'REQ-ORCH-139', verifier_gate_calibrated: 'REQ-ORCH-139',
  verifier_gate_written: 'REQ-ORCH-139', verifier_gate_authoring_skipped: 'REQ-ORCH-139', requirement_evidence: 'REQ-ORCH-139',
  child_start: 'REQ-ORCH-139', child_end: 'REQ-ORCH-139', child_result: 'REQ-ORCH-139', child_conversation_closed: 'REQ-ORCH-139',
  child_launch_suppressed: 'REQ-ORCH-139', child_user_cancelled: 'REQ-ORCH-139', quota_fallback_model: 'REQ-ORCH-139',
  fallback_model: 'REQ-ORCH-139', llm_unresponsive: 'REQ-ORCH-139', plan_gate_opened: 'REQ-ORCH-139',
  plan_gate_resolved: 'REQ-ORCH-139', 'session.start': 'REQ-ORCH-139', 'session.end': 'REQ-ORCH-139',
  // Domain 07: run startup's and teardown's entries, the stale-session repair's, and the entry every issue writes.
  run_start: 'REQ-SESSION-087', run_end: 'REQ-SESSION-094', 'session.interrupted_recovered': 'REQ-SESSION-062', issue: 'REQ-SESSION-135',
  // Domain 05's Data & Formats ("Session evidence"), and domain 10's for the two mode events.
  // (REQ-SANDBOX-104's `permission_mode_downgraded` is not a word: PD-TOOLS-002 withdrew it — see FORBIDDEN.)
  permission_approved: 'REQ-TOOLS-081', permission_mode_changed: 'REQ-SANDBOX-106',
  // Domain 06: the two checkpoint entries REQ-EVENTS-072 pairs with their events.
  checkpoint_created: 'REQ-GIT-048', checkpoint_restored: 'REQ-GIT-062',
  // Domain 09: one entry per completed hook invocation.
  hook_run: 'REQ-HOOKS-119',
  // Domain 14: the entry a materialized child report links back onto its artifact.
  artifact_published: 'REQ-LIBRARY-092',
  // PD-ORCH-014 (OQ-157, OQ-53, OQ-127; R-071): domain 01's list gains the run's own facts the product writes and reads back.
  model_exhausted: 'PD-ORCH-014', model_override: 'PD-ORCH-014', context_compressed: 'PD-ORCH-014',
  iteration_paused: 'PD-ORCH-014', iteration_resumed: 'PD-ORCH-014', child_paused: 'PD-ORCH-014', child_resumed: 'PD-ORCH-014',
  approval_withdrawn: 'PD-ORCH-014', question_withdrawn: 'PD-ORCH-014', run_pause_requested: 'PD-ORCH-014',
  run_pause_refused: 'PD-ORCH-014', run_continuation_intent: 'PD-ORCH-014', loop_supervisor_activation: 'PD-ORCH-014',
  context_selection: 'PD-ORCH-014', notice: 'PD-ORCH-014',
  waiting_on_tools: 'PD-ORCH-014', stall_recovered: 'PD-ORCH-014', corrective_message: 'PD-ORCH-014',
  // PD-CHAT-009 (OQ-157; R-071): the chat domain's words for the user's chat controls.
  steering_submitted: 'PD-CHAT-009', steering_injected: 'PD-CHAT-009', steering_not_delivered: 'PD-CHAT-009',
  prompt_queued: 'PD-CHAT-009', prompt_edited: 'PD-CHAT-009', prompt_removed: 'PD-CHAT-009', prompt_triggered: 'PD-CHAT-009',
  todo_edited: 'PD-CHAT-009', entry_model_switched: 'PD-CHAT-009', entry_reasoning_switched: 'PD-CHAT-009',
  transcript_cleared: 'PD-CHAT-009', pause_resolved: 'PD-CHAT-009', run_paused_message_limit: 'PD-CHAT-009',
  // PD-TOOLS-011 (OQ-76; R-071): domain 05's words for the user's presence under PD-TOOLS-005.
  user_away: 'PD-TOOLS-011', user_returned: 'PD-TOOLS-011',
};

/**
 * Names a requirement once fixed and a product directive has since withdrawn, each with the directive that governs: a
 * write of one fails the gate even though the displaced requirement still states it, and none may be a word or AWAITING.
 */
export const FORBIDDEN = {
  // PD-TOOLS-002: "There are no downgrade artifacts: no `permission_mode_downgraded` timeline event" (narrows REQ-SANDBOX-104/110).
  permission_mode_downgraded: 'PD-TOOLS-002',
};

/**
 * The names the product writes that no list has, each held by an open question until the owner rules (REQ-ORCH-139):
 * `name: { file, fact }`, `file` where it is written and `fact` what it records. Empty since OQ-157's ruling (2026-10-06).
 */
export const AWAITING = {};

/** A name passed as a variable, accepted only here: `{ file, expression, reason }`. */
export const PASS_THROUGH = [
  { file: 'packages/engine/src/session-writer.ts', expression: 'name', reason: '`appendTimeline` hands its own name to `appendTimelineEntry`, and `queuedMove` its third argument to the store; their callers are read' },
  { file: 'packages/engine/src/sessions.ts', expression: 'name', reason: 'the artifact store\'s timeline sink hands its caller\'s name through' },
  { file: 'apps/desktop/src/run-host/hooks.ts', expression: 'name', reason: 'the hooks engine\'s sink hands its caller\'s name (`hook_run`) through' },
  { file: 'apps/desktop/src/run-host/tools.ts', expression: 'name', reason: 'the permission gate\'s sink hands its caller\'s name through' },
  { file: 'apps/desktop/src/run-host/dispatch.ts', expression: 'req.name', reason: 'the `timeline.append` request hands main\'s name through; main\'s request is read' },
];

/** Callee name → the argument that carries the timeline name. */
const CARRIERS = { appendTimeline: 0, appendTimelineEntry: 0, timeline: 0, insertTimeline: 3, queuedMove: 2 };

function calleeName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return '';
}

/** Every timeline write in one source: `{ line, name }` for a literal name, `{ line, expression }` for any other. */
export function timelineWritesIn(text, fileName) {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const found = [];
  const line = (node) => source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = calleeName(node.expression);
      const index = Object.hasOwn(CARRIERS, callee) ? CARRIERS[callee] : -1;
      const arg = index >= 0 ? node.arguments[index] : undefined;
      // A sink's `timeline` is a call with a name first; `timeline` read as anything else is not a write.
      if (arg !== undefined && !(callee === 'timeline' && node.arguments.length < 3)) {
        if (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) found.push({ line: line(arg), name: arg.text });
        else found.push({ line: line(arg), expression: arg.getText() });
      }
    }
    if (ts.isObjectLiteralExpression(node)) {
      const prop = (key) => node.properties.find((p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === key);
      const kindProp = prop('kind');
      const nameProp = prop('name');
      if (kindProp && ts.isStringLiteral(kindProp.initializer) && kindProp.initializer.text === 'timeline.append' && nameProp) {
        if (ts.isStringLiteral(nameProp.initializer)) found.push({ line: line(nameProp), name: nameProp.initializer.text });
        else found.push({ line: line(nameProp), expression: nameProp.initializer.getText() });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

function sources(root) {
  const roots = [...readdirSync(join(root, 'packages')).map((name) => join(root, 'packages', name, 'src')), join(root, 'apps', 'desktop', 'src')];
  const out = [];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) { if (!['node_modules', 'generated', 'dist', 'out'].includes(entry.name)) walk(path); }
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(path);
    }
  };
  roots.forEach(walk);
  return out;
}

/** Domain 01's list as `docs/spec/01-run-orchestration.md` states it, or null where the section cannot be read. */
export function specVocabulary(root) {
  let text;
  try { text = readFileSync(join(root, 'docs', 'spec', '01-run-orchestration.md'), 'utf8'); } catch { return null; }
  const at = text.indexOf('### Timeline event vocabulary');
  if (at < 0) return null;
  const end = text.indexOf('\n### ', at + 1);
  const section = text.slice(at, end < 0 ? undefined : end);
  return [...section.matchAll(/`([a-z_.]+)`/g)].map((m) => m[1]);
}

/** The offending writes, the AWAITING and PASS_THROUGH entries that excuse nothing, and spec words missing here. */
export function checkProduct(root, vocabulary = VOCABULARY, awaiting = AWAITING, passThrough = PASS_THROUGH, forbidden = FORBIDDEN) {
  const problems = [];
  const written = new Set();
  const usedPass = new Set();
  for (const path of sources(root)) {
    const rel = relative(root, path).split(sep).join('/');
    for (const w of timelineWritesIn(readFileSync(path, 'utf8'), path)) {
      if (w.name === undefined) {
        const excuse = passThrough.findIndex((p) => p.file === rel && p.expression === w.expression);
        if (excuse >= 0) { usedPass.add(excuse); continue; }
        problems.push(`${rel}:${w.line}: a timeline name passed as \`${w.expression}\`, which this gate cannot read — write the name, or add a PASS_THROUGH entry with its reason`);
        continue;
      }
      written.add(w.name);
      if (Object.hasOwn(forbidden, w.name)) {
        problems.push(`${rel}:${w.line}: '${w.name}' is withdrawn by ${forbidden[w.name]} — no timeline event of that name may be written`);
        continue;
      }
      if (Object.hasOwn(vocabulary, w.name) || Object.hasOwn(awaiting, w.name)) continue;
      problems.push(`${rel}:${w.line}: '${w.name}' is in no timeline vocabulary (REQ-ORCH-139)`);
    }
  }
  const stale = [
    ...Object.keys(awaiting).filter((name) => !written.has(name)).map((name) => `AWAITING '${name}' is written nowhere — remove it, and say so in the open question that holds it`),
    ...Object.keys(awaiting).filter((name) => Object.hasOwn(vocabulary, name)).map((name) => `AWAITING '${name}' is a word of the vocabulary — remove it from AWAITING`),
    ...Object.keys(forbidden).filter((name) => Object.hasOwn(vocabulary, name) || Object.hasOwn(awaiting, name)).map((name) => `FORBIDDEN '${name}' (${forbidden[name]}) is also a word or AWAITING — remove it there`),
    ...passThrough.filter((_, i) => !usedPass.has(i)).map((p) => `${p.file}: PASS_THROUGH \`${p.expression}\` matches nothing — remove it`),
  ];
  const spec = specVocabulary(root);
  const drift = spec === null
    ? ['docs/spec/01-run-orchestration.md: the "Timeline event vocabulary" section could not be read']
    : spec.filter((name) => !Object.hasOwn(vocabulary, name)).map((name) => `domain 01's vocabulary has '${name}', which VOCABULARY lacks`);
  return { problems, stale, drift };
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const { problems, stale, drift } = checkProduct(join(import.meta.dirname, '..'));
  const all = [...problems, ...stale, ...drift];
  if (all.length > 0) {
    console.error(`check-timeline-vocabulary: ${all.length} problem${all.length === 1 ? '' : 's'} (REQ-ORCH-139 — name a timeline event only from a vocabulary):`);
    for (const p of all) console.error(`  ${p}`);
    process.exitCode = 1;
  } else console.log(`check-timeline-vocabulary: every timeline name the product writes is a word of a vocabulary${Object.keys(AWAITING).length > 0 ? ' or held by an open question' : ''}`);
}
