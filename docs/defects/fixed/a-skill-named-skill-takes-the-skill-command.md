## A skill named `skill` takes the `/skill` command, or loses its own, depending on registration order

**Repaired 2026-09-27, in the change that built `/skills`** (`first-release-plan.md` §2.2). Found by building
that command: it is the second fixed catalogue command to carry the `skill` kind badge, and adding it made the
first one's collision visible.

The composer's skill registrar (`registerSkillCommands`) decided whether a name was *taken* by asking whether
its holder was a command of a kind other than `skill`: a holder of kind `skill` was read as the registrar's own
earlier work, to be replaced in place after a rescan. But `/skill <path>` — a fixed catalogue command
(REQ-CHAT-162), registered by its own effect in `slash/controls.tsx` — carries the `skill` kind badge too
(REQ-CHAT-025's closed set has no other fitting badge). So for a discovered, user-invocable skill whose declared
name reduces to `skill`:

- when the generated commands registered **after** the fixed one, the skill's command **replaced** `/skill <path>`
  — the built-in changed meaning because a skill was installed;
- when they registered **before** it, the fixed command then replaced the skill's — the skill was silently
  unreachable from the composer.

Which of the two happened depended on which React effect ran first, so neither was stable. The same shape
applied to `/skills` from the moment it existed.

**The repair.** `FIXED_SKILL_COMMAND_NAMES` (`skill`, `skills`) are always taken, so a skill declaring either
name is offered `skill-2` / `skills-2` with its description naming the skill, whatever order the registrations
run in. `packages/ui/src/slash/skills.test.ts` asserts both orders and a rescan; with the one-line rule removed,
all three of its new cases fail.

**"Whatever order" held for the skill registrar only.** The prompt-file registrar had the same hole, and gate round 1
of the same change found it: a `skills.md` took `/skills` back on the first re-read after mount. Repaired the same
day by the same rule — `a-prompt-file-named-skills-takes-the-skills-command.md`.

## Specs

`REQ-SHELL-056`: "Built-in commands SHALL always win a name collision … so a skill is never silently unreachable
from the composer and a built-in command never changes meaning because a skill was installed." Both halves were
contradicted, one per registration order. `REQ-CHAT-034` (as amended 2026-09-27, ESC-39) cites the same rule:
"the command already holding it keeps it and the skill is offered under the first free suffixed name".

## Relevant files

- `packages/ui/src/slash/skills.ts` — `registerSkillCommands`' `taken` predicate, and `FIXED_SKILL_COMMAND_NAMES`
  beside the two fixed commands it protects.
- `packages/ui/src/slash/controls.tsx` — the separate effects that register `/skill`, `/skills` and the generated
  commands, whose order was the variable.
- `packages/ui/src/slash/skills.test.ts` — the three cases that pin the rule.
