/**
 * The live `plan-open` and `empty-answer` scenarios' readings (fin42, the survey's N56): `PD-ORCH-015` — a coordinating root
 * that answers with an item of its plan open is corrected in its own conversation, and where it ignores the correction its task
 * is re-queued with a `system` row and the answer it wrote is carried to the next fresh root — and `PD-ORCH-009` revision 2 — a
 * root that ends its turn with nothing for the person is asked once more, and the person is told if it still writes nothing.
 *
 * Every reading comes from the application log, the recorded traffic (what the model was SENT), the transcript's `system` rows
 * and the store's iterations, never from the model's prose. The texts are the product's own, pinned against the engine's
 * exports in `plan-open-reading.test.ts`.
 *
 * Nothing here is product code. It runs only from the live run.
 */

/** `Run.turn`'s warning for each correction it sends (`packages/engine/src/run/run.ts`). */
export const CORRECTION_WARNING = /a correction is sent into its conversation \((\d+) of (\d+), REQ-ORCH-078, PD-ORCH-015\)/g;
/** `Run.turn`'s warning for the one answer re-prompt (PD-ORCH-009). */
export const REPROMPT_WARNING = /ended its turn without writing an answer; it is asked once more \(PD-ORCH-009, OQ-199\)/g;
/** The sentence `planCorrectionText` and `planCarryText` share, and the opening a correction after an answer adds. */
export const NOT_COMPLETE = 'of your plan not complete, so the task is not complete:';
export const SHOWN = 'Your answer has been shown to the person. ';
/** `planCarryText`'s marker head and the label of the held answer it carries (`PD-ORCH-015`). */
export const CARRY_HEAD = 'The previous iteration on this task declared success with ';
export const HELD_LABEL = 'Your previous iteration answered as follows, and the person was shown it:\n';
export const HELD_TAIL = '\n\nWhere it shows an item done, record that item COMPLETED with the todo tool rather than doing the work again.';
/** `ANSWER_REPROMPT` (`packages/engine/src/run/run.ts`). */
export const ANSWER_REPROMPT = 'You ended your turn without writing an answer. Write your answer to the user now, in plain text: what you did, what you found, and anything left open.';
/** `planHeldRowText`: the `system` row of a re-queue or a give-up for an open plan. */
export const HELD_ROW = /^Iteration (\d+): the coordinator answered with (\d+) items? of its plan not done: (.+)\. The task was (not marked complete and was returned to the queue|given up on at the retry limit)\.$/s;
/** `Run.tellUnanswered`'s `system` row. */
export const UNANSWERED_ROW = /^(The run|Iteration \d+) ended without an answer: (.+) ended its turn without writing one, even when asked once more\.$/;
/** The coordinating root's own instructions open with this, in every request it makes (and no other agent's do). */
export const ROOT_MARK = 'You are the orchestrator.';
/** The intent classifier's instructions open with this; its request carries the person's prompt too. */
export const CLASSIFIER_MARK = 'You classify a user request';

/** The text of one OpenAI-shaped message's content, a string or a list of parts. */
function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((p) => (typeof p === 'string' ? p : typeof p?.text === 'string' ? p.text : '')).join('');
  return '';
}

/**
 * One recorded request body, read: whether it is the coordinating root's, its messages' roles and texts, and the text of its
 * last user message — where a correction, a re-prompt or a continuation is sent. A body that will not parse reads as no messages.
 */
export function requestOf(body) {
  let parsed = {};
  try { parsed = JSON.parse(String(body ?? '')); } catch { parsed = {}; }
  const messages = Array.isArray(parsed.messages) ? parsed.messages.map((m) => ({ role: String(m?.role ?? ''), text: textOf(m?.content) })) : [];
  const system = messages.filter((m) => m.role === 'system').map((m) => m.text).join('\n');
  const users = messages.filter((m) => m.role === 'user');
  return { root: system.includes(ROOT_MARK), system, messages, lastUser: users.at(-1)?.text ?? '', firstUser: users[0]?.text ?? '' };
}

/** The answer a continuation carries after `HELD_LABEL`, or null when it carries none. */
export function heldAnswerOf(text) {
  const at = String(text).indexOf(HELD_LABEL);
  if (at < 0) return null;
  const rest = String(text).slice(at + HELD_LABEL.length);
  const end = rest.indexOf(HELD_TAIL);
  return end < 0 ? rest : rest.slice(0, end);
}

/**
 * `PD-ORCH-015`'s reading of one launch.
 *
 * @param {{ log: string, bodies: string[], systemRows: string[], iterations: Array<{ iteration: number, outcome: string | null }>,
 *           answers?: string[] }} input  `answers` are the session's non-empty assistant rows, in order.
 */
export function planReading({ log, bodies, systemRows, iterations, answers = [] }) {
  const warnings = [...String(log).matchAll(CORRECTION_WARNING)].map((m) => ({ n: Number(m[1]), of: Number(m[2]) }));
  const roots = bodies.map(requestOf).filter((r) => r.root);
  // A correction is the last user message of the request it leads to; a continuation's marker is in a fresh root's FIRST user
  // message, which every later request of that root repeats, so it is read in the root's first request alone (nothing but its
  // instructions and that message).
  const corrections = roots.filter((r) => r.lastUser.includes(NOT_COMPLETE) && !r.lastUser.includes(CARRY_HEAD) && r.lastUser !== r.firstUser);
  const carries = roots.filter((r) => r.messages.filter((m) => m.role !== 'system').length === 1 && r.firstUser.includes(CARRY_HEAD));
  const heldRows = systemRows.filter((row) => HELD_ROW.test(row));
  const held = carries.map((r) => heldAnswerOf(r.firstUser)).filter((a) => a !== null);
  const reprompts = roots.filter((r) => r.lastUser === ANSWER_REPROMPT).length;
  return {
    warnings, corrections: corrections.length, shownSaid: corrections.some((r) => r.lastUser.startsWith(SHOWN)),
    heldRows, carries: carries.length, heldAnswers: held,
    // The held answer is one the person was shown: an answer of the session, or the start of one cut at 6,000 characters.
    heldIsAnAnswer: held.length > 0 && held.every((a) => a.trim() !== '' && answers.some((x) => x.trim() === a.trim() || x.trim().startsWith(a.trim()))),
    reprompts, outcomes: iterations.map((i) => i.outcome),
    reached: warnings.length > 0,
    requeued: heldRows.length > 0,
  };
}

/**
 * `PD-ORCH-009` revision 2's reading of one launch: the re-prompts the root was sent (requests whose last user message is
 * `ANSWER_REPROMPT`) and logged, the empty answers the proxy gave, the `system` rows and `incomplete_execution` issues.
 *
 * @param {{ log: string, bodies: string[], systemRows: string[], issues: Array<{ kind: string, severity: string, metadata: string }>,
 *           fired: number }} input  `fired` is how many `empty` answers the proxy gave in this launch.
 */
export function answerReading({ log, bodies, systemRows, issues, fired }) {
  const roots = bodies.map(requestOf).filter((r) => r.root);
  const unanswered = systemRows.filter((row) => UNANSWERED_ROW.test(row));
  const incomplete = issues.filter((i) => i.kind === 'incomplete_execution').map((i) => { let metadata = {}; try { metadata = JSON.parse(i.metadata); } catch { metadata = {}; } return { severity: i.severity, metadata }; });
  return {
    fired, rootRequests: roots.length,
    reprompts: roots.filter((r) => r.lastUser === ANSWER_REPROMPT).length,
    logged: [...String(log).matchAll(REPROMPT_WARNING)].length,
    unanswered, incomplete,
  };
}
