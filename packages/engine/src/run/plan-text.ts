import type { PlanDecision } from '@rotaris/contracts';

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
 * REQ-ORCH-154: what the next segment is told about the plan it inherits. On **approve** it is the plan the run
 * carries out, carried whole and unedited by the product (the user's own text where they edited it). On **revise**
 * it is "the plan as it currently stands together with the changes the user stated" — both, and in that order, so
 * the producing role revises rather than starts again.
 */
export function planSection(decision: PlanDecision, plan: string, changes: string): string {
  if (decision === 'approve') {
    return ['The user approved this plan. Carry it out; every tool the plan gate withheld is now available.', '', 'Approved plan:', plan].join('\n');
  }
  return [
    'The user asked for a revision of this plan. Produce a fresh plan that answers what they said; do not begin the work.',
    '', 'The plan as it currently stands:', plan,
    '', 'The changes the user stated:', changes.trim() === '' ? '(the user stated no specific changes)' : changes,
  ].join('\n');
}
