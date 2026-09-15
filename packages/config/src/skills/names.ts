/**
 * REQ-WORKSPACE-054 — the skill name's normal form, and the ONE place it is written.
 *
 * Lower-cased; every run of characters outside `[a-z0-9]` becomes a single `-`; leading and trailing
 * `-` stripped. A name normalising to the empty string is invalid and yields no skill.
 *
 * **This is not the catalogue's normal form, deliberately.** `REQ-SHELL-056` fixes a different one for a
 * typed command — whitespace and underscore runs become `-`, every *other* character outside
 * `[a-z0-9-]` is REMOVED rather than replaced — so `c++ build` is the skill `c-build` and the command
 * `/cbuild`. The two disagree and the disagreement is logged as ESC-39; until it is ruled, this form is
 * the skill's identity everywhere (the policy maps, the catalog block, the table, the shadowing rule)
 * and `ui/src/slash/skills.ts` applies the other form to the command alone, which is exactly what
 * REQ-SHELL-056 says it contributes.
 */
export function normalizeSkillName(declared: string): string {
  return declared.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * REQ-WORKSPACE-055: a description's whitespace collapsed to single spaces. Applied to the frontmatter's
 * `description` before it is carried anywhere, so the catalog block's one-line-per-skill shape
 * (REQ-WORKSPACE-061) cannot be broken by a field written across several lines.
 */
export function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
