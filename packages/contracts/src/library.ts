import { z } from 'zod';

/**
 * Part X — the Library domain's vocabulary as it crosses a boundary: the two saved-prompt lists, their
 * caps, the state both lists travel as, and the closed set of things a "library change" can be.
 *
 * The three tab names are NOT here: `REQ-LIBRARY-103` is their single definition and `notices.ts`
 * already holds the one copy (`LIBRARY_TABS`), cited by the notice action that opens one.
 */

/** REQ-LIBRARY-137/138: two lists, per workspace, newest first. */
export const PROMPT_LISTS = ['history', 'stash'] as const;
export const PromptListSchema = z.enum(PROMPT_LISTS);
export type PromptList = z.infer<typeof PromptListSchema>;

/**
 * REQ-LIBRARY-139's two caps are NOT here. They are "fixed by this document: neither is configurable, and no key
 * of any scope changes them", so there is exactly one copy of the figures and it is `PROMPT_CAPS` in
 * `@rotaris/store`, beside the statements that enforce them — the placement `RING_CAPS` already takes for
 * REQ-SESSION-133. A second copy on this side would be a figure nothing checks against the first. No surface
 * displays either number; a list that arrives here has already been capped.
 */

/** Both lists as any surface sees them: newest first, blank entries already dropped, capped. */
export const PromptStateSchema = z.object({
  history: z.array(z.string()),
  stash: z.array(z.string()),
});
export type PromptState = z.infer<typeof PromptStateSchema>;

/**
 * REQ-LIBRARY-105 closes the definition of a "library change" to exactly four things — the prompt
 * history, the prompt stash, the session artifact store, and the workspace's improvement artifacts —
 * and says in the same breath that a settings change that touches none of them "MUST NOT count as a
 * library change". The set is a type, not a convention: nothing outside it can be handed to the
 * counter that bumps the revision, so a settings write cannot bump it by mistake.
 *
 * Part X writes the first two. `session-artifacts` is Part Y's to bump and `improvement-artifacts`
 * belongs to the Proposals part that is not yet authorised; both are declared here because the set is
 * the requirement's and is closed by it, not by how much of it has been built.
 */
export const LIBRARY_CHANGES = ['prompt-history', 'prompt-stash', 'session-artifacts', 'improvement-artifacts'] as const;
export type LibraryChange = (typeof LIBRARY_CHANGES)[number];
