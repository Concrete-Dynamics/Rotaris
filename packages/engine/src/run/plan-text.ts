import type { PlanDecision } from '@rotaris/contracts';
import { cut } from './cut.js';

/**
 * REQ-ORCH-153 / REQ-ORCH-154 (ADR-0062): the two things a plan cycle is told, kept side by side because they
 * are halves of one conversation — what the role is asked for when a cycle opens, and what it is handed back
 * when the user has answered. They live here rather than beside the session manager so the run can read the
 * first without the engine's session module reading the run (the import would close a cycle).
 */

/**
 * What the producing role is told when a plan cycle opens.
 *
 * Found by building (2026-09-16): `parkAtPlanGate` ran ONE ordinary turn on the user's own prompt and took its
 * final text as the plan, and nothing in that turn said so. The role therefore did what the prompt asked —
 * tried to do the work — collected `plan_gate_withheld` refusals whose only remedy read "finish the plan",
 * and then asked for approval through `ask_questions`, which no plan gate reads. The hold ran eighteen minutes
 * and produced no plan the user was ever shown. The mechanism was right in every part; the role was told none
 * of it. This section is that telling, and it states the three facts the model cannot infer: the final message
 * IS the plan, the decision is taken in the product and not in the conversation, and the withholding ends by
 * approval rather than by persistence.
 */
export function planRequestSection(): string {
  return [
    'This run is held at the plan gate (REQ-ORCH-153): it produces a plan first, and does the work only after the user approves it.',
    '',
    '- Write the plan as the final message of this turn, then stop. That message is the plan: the product presents it to the user exactly as written.',
    '- The decision is the user\'s, and they take it in the product — approve, revise or cancel. Do not ask for approval in the conversation; no question tool releases the gate, and an answer to one approves nothing.',
    '- Do not begin the work. Every tool that writes workspace files or runs commands is withheld while the gate is held, whichever role calls it and however the call is made. Reading, searching, fetching and delegating to roles that only read are available, and a plan is written by reading.',
    '- Approval releases those tools for the rest of the run and hands the approved plan back to you to carry out. Revision asks you for another plan, with what the user said.',
    '',
    'The task to plan for follows.',
  ].join('\n');
}

/**
 * PD-ORCH-003 revision 2: what a plan cycle held after a resumed iteration is told, after `planRequestSection`. The
 * launch content it is also given is the continue that resumed the iteration, so the work to plan for is the todo's
 * pending tasks, stated first and in the order the run takes them up — the first twenty, the count the handoff shows of
 * its todo (REQ-SESSION-115), each cut to 500 characters rather than the handoff's 80, since here a task's text is the
 * work to plan and not a display title (OQ-77). `message` is what became of the continues' messages the resumed iteration
 * held (PD-ORCH-005 clause 17): `done` when it succeeded, `pending` when it closed otherwise — they are then among the
 * pending tasks, taken up first — and `none` when it held none. The iteration is said to have been "left open", not by
 * what: a rest or a crash left it, and a crash-left session's continues take this path too (OQ-77).
 */
export function resumedWorkSection(iteration: number, pending: readonly string[], message: 'done' | 'pending' | 'none'): string {
  const shown = pending.slice(0, 20).map((text) => `- ${cut(text, 500)}`);
  if (pending.length > 20) shown.push('- [... additional pending tasks elided]');
  return [
    `This run resumed iteration ${iteration}, which was left open, and that iteration has closed. What follows it is new work, and the plan is for that work: the tasks still pending, in the order the run takes them up.`,
    '',
    'Pending tasks:',
    ...(shown.length > 0 ? shown : ['- (none)']),
    '',
    message === 'done' ? 'The request that continued the session follows as context; the resumed iteration has already carried out its message.'
      : message === 'pending' ? 'The request that continued the session follows as context; the resumed iteration did not finish its message, which is among the pending tasks above and is taken up first.'
        : 'The request that continued the session follows as context.',
  ].join('\n');
}

/**
 * REQ-ORCH-154: what the next segment is told about the plan it inherits. On **approve** it is the plan the run
 * carries out, carried whole and unedited by the product (the user's own text where they edited it). On **revise**
 * it is "the plan as it currently stands together with the changes the user stated" — both, and in that order, so
 * the producing role revises rather than starts again.
 *
 * The section names the PRODUCT as its speaker, as `planRequestSection` above does. It is delivered inside a
 * `role: 'user'` payload, and it used to open "The user approved this plan" — a user-role turn narrating the user
 * in the third person, which leaves the model to work out for itself whether a person just spoke to it. Nothing
 * requires this wording; the run that prompted the change (`a26918e8`, 2026-09-16) showed the cost of the same
 * shape elsewhere, where a product-authored steering message read as a user instruction and the run spent three
 * minutes reconciling it with what it remembered the user asking for.
 */
export function planSection(decision: PlanDecision, plan: string, changes: string): string {
  if (decision === 'approve') {
    return [
      'The plan gate has resolved (REQ-ORCH-153): the user approved this plan in the product. This section is the product handing the plan back, not the user speaking again.',
      'Carry it out; every tool the gate withheld is now available.',
      '', 'Approved plan:', plan,
    ].join('\n');
  }
  return [
    'The plan gate has resolved (REQ-ORCH-153): the user chose revise in the product. This section is the product opening the next plan cycle, not the user speaking again.',
    'Produce a fresh plan that answers what they asked for; do not begin the work.',
    '', 'The plan as it currently stands:', plan,
    '', 'The changes the user stated:', changes.trim() === '' ? '(the user stated no specific changes)' : changes,
  ].join('\n');
}
