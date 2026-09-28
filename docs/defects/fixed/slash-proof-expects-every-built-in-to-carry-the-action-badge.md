## `slash-proof` expects every built-in to carry the `action` badge, which `/skill` has not since 2026-09-15

`slash-proof` opens the popup on `/` and asserts that the set of kind badges across every listed row is exactly
`action` — "every built-in and mirror carries the action badge". It was written in Part AN (2026-09-09), when the
catalogue held only built-ins and palette mirrors. ADR-0063 (2026-09-15) added `/skill <path>` — a fixed catalogue
command (REQ-CHAT-162) — with the `skill` badge, and it is registered by the same component as the built-ins'
replacements for `/compress` and `/clear`, so it is in the popup the proof reads. The assertion therefore fails at
`action,skill`, and every check after it in the launch never runs.

Measured 2026-09-27 on Linux: `pnpm slash-proof` on unmodified `main` (56801df) fails there with `action,skill`, and
fails at the same line with the `/skills` listing built (which adds a second `skill`-badged fixed command). The
proof reaches no check it reached before and loses none, but it has been red at its first catalogue assertion since
`/skill` landed, and nothing records it: `first-release-plan.md` names four red proofs and this is not among them.

Two readings, and the record has not chosen between them. REQ-CHAT-025 fixes the closed set `action`, `skill`,
`prompt` and says only that `prompt` marks a prompt-file entry; it does not say which badge a fixed command about
skills carries. ADR-0063 chose `skill` for `/skill`, and `/skills` follows it; the proof's sentence reads every
built-in as `action`. Either the proof's assertion excludes the fixed `skill`-kind commands (and asserts them as
`skill`), or those commands move to `action` — which would also let the skill registrar's "a `skill` holder is mine"
rule stand without `FIXED_SKILL_COMMAND_NAMES`. **Not repaired here.**

## Specs

REQ-CHAT-025 (the badge set) is not contradicted by the product either way; the proof asserts a reading of it the
product stopped matching when ADR-0063 landed. Every later check in the launch — REQ-CHAT-019..033, REQ-CHAT-159,
REQ-LIBRARY-142, REQ-CHAT-042..044 in the built app — is unproven on a run that stops here.

## Relevant files

- `apps/desktop/scripts/slash-proof.mjs` — the `kinds` assertion after the popup opens.
- `packages/ui/src/slash/skills.ts` — `skillPathCommand` and `skillsListCommand`, both `kind: 'skill'`, and
  `FIXED_SKILL_COMMAND_NAMES`.
- `packages/ui/src/slash/controls.tsx` — where the two fixed commands register beside `/compress` and `/clear`.
