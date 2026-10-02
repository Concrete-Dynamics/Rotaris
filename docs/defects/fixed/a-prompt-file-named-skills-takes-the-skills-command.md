## A prompt file named `skills.md` takes `/skills` from the listing shortly after the composer mounts

**Repaired 2026-09-27, in the change that built `/skills`** (`first-release-plan.md` §2.2), after gate round 1 of
that change found it. The same exposure applied to `skill.md` and `/skill <path>` from ADR-0063 (2026-09-15) on.

The prompt-file registrar (`registerPromptCommands`) treated a name as *free to replace* when its holder was a
`prompt` command **or** when the name was among those the registrar had recorded as its own on its last apply
(`previouslyRegistered`). The two fixed skill commands (`/skill`, `/skills`, REQ-CHAT-162) register by their own
effects in `slash/controls.tsx`, and every step before them puts the prompt files on the registry first:

1. `buildCatalogue` applies the cached prompt roots to the freshly built registry; nothing holds `skills`, so the
   prompt file `skills.md` takes the bare stem as well as `prompts:skills`.
2. The registrar's mount effect applies the cached answer again and records `skills` among its names.
3. The `/skills` effect replaces the prompt command with the listing.
4. The next prompt re-read — the configuration key's reload on mount, or any composer focus — finds `skills` held by
   a `skill`-kind command but in its own record, reads it as its own, and replaces the listing with the prompt.

From then on, typing `/skills` ran the prompt file. Reproduced by the gate's scratch test against the real registry,
`registerPromptCommands` and `skillsListCommand` (after mount `skills` was the listing; after the re-read it was
`Prompt file skills.md (workspace)`), and again by the case this repair adds, which fails without it.

The earlier repair in `a-skill-named-skill-takes-the-skill-command.md` claimed the two names were safe "whatever
order the registrations run in"; that held for the **skill** registrar only.

**The repair.** The prompt registrar holds `FIXED_SKILL_COMMAND_NAMES` as taken, exactly as the skill registrar
does, so a `skills.md` or `skill.md` registers only under its prefixed name (`/prompts:skills`, `/prompts:skill`) at
every one of the four steps, and the fixed commands are never displaced. `packages/ui/src/slash/skills.test.ts`
drives the four steps in order.

Not taken: registering `/skill` and `/skills` inside `buildCatalogue` beside the built-ins. That would also close the
AO-2 window in which a command registered only by an effect is missing from the popup until the next keystroke, but
`/skill`'s success path re-reads the catalog through the registrar's own reader, and moving both would change when
the catalogue is rebuilt. Recorded here as the larger alternative, not as owed.

## Specs

`REQ-CHAT-160`: "Where a name is already held by another command, the command already holding it keeps it and this
registration is skipped." `REQ-CHAT-162`: "The catalogue MUST offer a command that lists the discovered skills into
the transcript as a single system row, and a command that loads a skill from a path." With such a file present, the
catalogue offered neither under its name.

## Relevant files

- `packages/ui/src/slash/prompts.ts` — `registerPromptCommands`' `taken` predicate.
- `packages/ui/src/slash/skills.ts` — `FIXED_SKILL_COMMAND_NAMES`, now read by both registrars.
- `packages/ui/src/slash/catalogue.ts` — `buildCatalogue`, which applies the cached prompt roots before any effect runs.
- `packages/ui/src/slash/controls.tsx` — the effect order: prompt roots, then skill commands, then `/skill`, then `/skills`.
- `packages/ui/src/slash/skills.test.ts` — the case that drives the mount order.
