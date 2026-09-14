import type { ResolvedSkill } from './policy.js';

/**
 * REQ-WORKSPACE-061 and 062 — the two blocks a skill can put in front of a model, and the only two.
 * `REQ-WORKSPACE-066` closes the set: a body enters model context through the agent's own filesystem or
 * shell tools, an explicit user command, or the `on` policy, and **the framework never pre-fetches or
 * rewrites one**. So `blocks.ts` renders; it does not summarise, truncate or reformat.
 */

/**
 * The catalog block's preamble. REQ-WORKSPACE-061 fixes the three facts and leaves the wording to the
 * implementation:
 *
 * 1. every entry below names a `SKILL.md` file that **exists on disk**;
 * 2. such a file is to be opened **only when the task in hand calls for it**;
 * 3. **none of those files' contents have already been supplied**.
 *
 * Fact 3 is the one that earns the block: without it a model reading a list of names and one-line
 * descriptions has no way to tell whether it has been handed the skills or merely told they exist, and
 * the expensive failure is the model that acts on a description it never read the body of.
 */
export const SKILL_CATALOG_PREAMBLE = [
  'Portable skills available in this workspace. Each line names a SKILL.md file that exists on disk and gives its one-line description.',
  'The contents of these files have NOT been supplied to you — only the names, the descriptions and the paths below.',
  'Open a SKILL.md with your file tools only when the task in hand calls for that skill; otherwise ignore it.',
].join('\n');

/** REQ-WORKSPACE-061, Data & Formats: `- {name}: {description} (SKILL.md: {absolute path})`, one line each. */
export function skillCatalogLine(name: string, description: string, path: string): string {
  return `- ${name}: ${description} (SKILL.md: ${path})`;
}

/**
 * The model-facing catalog block: a preamble, then exactly one entry per catalogued skill and nothing
 * else, in ascending normalized-name order. **No skill's body text appears anywhere in the block.**
 * Returns null when no skill is catalogued, so no empty unit is constructed.
 */
export function skillCatalogBlock(resolved: readonly ResolvedSkill[]): string | null {
  const entries = resolved.filter((r) => r.inCatalog);
  if (entries.length === 0) return null;
  const lines = entries.map((r) => skillCatalogLine(r.skill.name, r.skill.description, r.skill.path));
  return `${SKILL_CATALOG_PREAMBLE}\n${lines.join('\n')}`;
}

/**
 * REQ-WORKSPACE-062's activation statement, which must name the skill and direct that its guidance apply
 * **from that point onwards — unconditionally, with no trigger phrase awaited and no question asked about
 * whether to activate it**. That last clause is the whole reason the statement exists: a body pasted in
 * without one reads to a model as reference material it may consult, and the user who invoked the command
 * meant it to be in force.
 *
 * It also carries REQ-CHAT-162's three identifying facts — that this is the body of a skill document,
 * which skill, and the absolute path it was read from — which is how one block satisfies both domains
 * (ESC-37: what a ruling may still move is the block's LIFETIME, not what it says).
 */
export function skillActivationStatement(name: string, path: string): string {
  return [
    `The following is the body of the skill document "${name}", read verbatim from ${path}.`,
    `Its guidance applies from this point onwards. Follow it unconditionally: do not wait for a trigger phrase and do not ask whether to activate it.`,
  ].join('\n');
}

/**
 * One force-loaded body block: the activation statement, then the skill's body with its frontmatter
 * removed, unaltered. `body` is what `parseSkill` returned below the closing `---`, so nothing is
 * inserted into or removed from it here (REQ-CHAT-162, REQ-WORKSPACE-066).
 */
export function skillBodyBlock(name: string, path: string, body: string): string {
  return `${skillActivationStatement(name, path)}\n\n${body.trim()}`;
}
