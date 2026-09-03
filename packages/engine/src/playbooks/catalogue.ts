import type { PlaybookCatalogue, PlaybookSlot } from '@rotaris/contracts';

/**
 * REQ-ORCH-020/026: the built-in playbook catalogue — every slot, every variant identifier, the text of
 * each. The specification fixes the eight slot names, their semantics and the lookup rules; the text is
 * this implementation's own authorship. This listing is what an override may address and what the
 * settings interface shows (REQ-ORCH-026 "user-inspectable").
 */
export const CATALOGUE: PlaybookCatalogue = Object.freeze({
  ROUTE: {
    routed: 'Your assignment is inside the standard flow: the coordinator routed it to you by need and the rest of the run expects the outcome named in the task.',
    not_routed: 'Your assignment is outside the standard flow. Treat it as narrow: do exactly what the task states, assume nothing about the wider run, and report what you did not do.',
  },
  AUTONOMY: {
    confirm: 'Confirm before any change that is hard to reverse; where the task leaves a choice open, state the options and pick the least surprising one.',
    proceed: 'Proceed without asking on ordinary decisions; stop and report when the task cannot be done as stated.',
    own: 'Own the outcome: make the decisions the task leaves open, record each one where it is made, and report them at the end.',
  },
  RESEARCH: {
    none: 'Do no research beyond what the task hands you.',
    targeted: 'Read only what the change touches and what it is called from; stop reading when the next step is clear.',
    thorough: 'Understand the surrounding design before changing anything: how the area is built, what depends on it, and what verifies it.',
  },
  CHUNKING: {
    single: 'Do the work as one change.',
    small_steps: 'Work in small steps, each leaving the code working, each verified before the next.',
    milestones: 'Divide the work into milestones with a checkable outcome each; finish and verify one before starting the next; keep the todo list current.',
  },
  VERIFY: {
    none: 'No verification is expected of you; report what you found or produced.',
    run_checks: 'Run the checks that cover what you changed and report each command with its exit status.',
    prove: 'Prove the change: run the full verification the workspace defines, add a check where none covers the change, and report every result.',
  },
  ARTIFACT: {
    none: 'Produce no artifact beyond your report.',
    summary: 'Leave a short written summary of what changed and why, where the workspace keeps such notes.',
    full: 'Leave a full record: what changed, why, what was verified, what remains, in the form the workspace keeps.',
  },
  OUTPUT: {
    answer: 'Answer plainly and directly; cite the files and lines your answer rests on.',
    report: 'Report what you did, what you verified, and what remains, in that order, briefly.',
    plan: 'Produce an ordered plan: numbered steps, each with its files, its outcome and how it is verified; name the open decisions.',
  },
  BUDGET: {
    tight: 'Delegate sparingly: at most 2 children active and 6 in total, no deeper than 2.',
    normal: 'Delegate as the work divides: at most 4 children active and 12 in total, no deeper than 3.',
    wide: 'Delegate freely within the configured limits.',
  },
});

export const SLOT_DEFAULT_VARIANT: Readonly<Record<PlaybookSlot, string>> = Object.freeze({
  ROUTE: 'routed', AUTONOMY: 'proceed', RESEARCH: 'targeted', CHUNKING: 'small_steps', VERIFY: 'run_checks', ARTIFACT: 'none', OUTPUT: 'report', BUDGET: 'normal',
});
