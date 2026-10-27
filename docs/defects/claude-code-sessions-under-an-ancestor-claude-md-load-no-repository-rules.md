## Claude Code sessions under an ancestor CLAUDE.md load no repository rules

The repository has no root `CLAUDE.md` since 2026-10-27: the owner chose option (a) on PR #28 over option (b), a root
`CLAUDE.md` holding only the import `@AGENTS.md`, and accepted the consequence explicitly, asking for it to be recorded.
This note is that record.

**Closed on the host, 2026-10-27.** The condition this note describes is a `CLAUDE.md` above the checkout, and the only
one that ever existed was the agent host's `/home/glados/CLAUDE.md`. It has been moved aside
(`~/.CLAUDE.md.removed-20261027`, backed up as `~/CLAUDE.md.bak-20261027`), so no `CLAUDE.md` stands in or above a
checkout of this repository any more and Claude Code's own discovery reaches `AGENTS.md` again. Measured after the
removal, in this branch's real checkout, Claude Code 2.1.310 with every tool disabled: **3 of 3 sessions held the
repository `AGENTS.md`** and listed its headings by name ("Agent harnesses — one set of files", "The proof scripts —
the rules they obey", "Traceability", "Where the work happens", …), with no help from any repository file — the session
in run 3 even noted that it had been loaded because no ancestor `CLAUDE.md` was blocking it.

**The repository carries no crutch for it, and that is deliberate.** A `.claude/rules/repository-rules.md` whose body
was the import `@../../AGENTS.md` (no `paths:` frontmatter, so it loads eagerly at session start) was tried on this
branch — commit `bd46f85a`, measured to reach the rules even under an ancestor `CLAUDE.md`. With the ancestor file
removed the route is redundant: discovery loads `AGENTS.md` on its own, and a second, silent route to the rules is
exactly the duplicate this repository's "one set of files" rule forbids. So the commit was dropped (`git reset --hard
86d0867d`) and `tools/agent-config.test.ts` now **fails any `.claude/rules/` file without `paths:` frontmatter**,
instead of pinning that import, so the eager shape cannot come back unnoticed. The host rules could not have served
either: putting them in `~/.claude/CLAUDE.md` suppresses the `AGENTS.md` fallback the same way an ancestor
`CLAUDE.md` does (measured), so it is not a route.

**What this note stays open for.** The closure is a host action, outside this repository — the note therefore stays
here rather than moving to `fixed/`, which is for repairs made in the repository. A host that reintroduces a
`CLAUDE.md` above the checkout restores the condition exactly as described below; that is not a defect of this
repository and gets a new note citing this one.

**What breaks.** Claude Code 2.1.310 loads the first `CLAUDE.md` it finds walking up from the checkout, and once it
finds one it does not read `AGENTS.md` at all. `AGENTS.md` is only a fallback for a checkout that has no `CLAUDE.md`
anywhere above it. While the agent host had `/home/glados/CLAUDE.md` (the line `@AGENTS.md`, which imports
`/home/glados/AGENTS.md`, not this repository's), the fallback never triggered there. A Claude session in any
checkout of this repository on that host started without the repository's rules: the clean-room hard boundary, the
gate, the traceability obligation, the proof rules and the handoff shape. Nothing errored. The session simply
proceeded without them.

**Measured** (PR #28's comment of 2026-10-27, "Empirical proof"). Claude Code 2.1.310, `claude -p --max-turns 1
--output-format json`, with every tool disabled, so that a canary can appear only if its file was loaded into context.
The model was asked to print any canary it held:

| Run | Repo `CLAUDE.md` | Repo `AGENTS.md` | `CLAUDE.md` above the checkout | Answer |
| --- | --- | --- | --- | --- |
| G | absent | canary `ZQ7…` | absent all the way up | `ZQ7-MARBLE-9F3K`: `AGENTS.md` is read |
| H | absent | canary `NQ4…` | one level up, canary `VX2…` | `VX2-THISTLE-8P1Q` only: the ancestor suppresses `AGENTS.md` |
| **I** | **absent** | **canary `ZB9…`** | **`/home/glados/CLAUDE.md`** | no canary; the model saw only the host's `@AGENTS.md` line: **the host condition, no repository rules** |
| J | `@AGENTS.md` | canary `ZB9…` | present | `ZB9-QUARTZ-4W7L`: the import loads the rules (option (b)) |
| K | own text, canary `KD5…`, no import | canary `ZB9…` | present | `KD5-ONYX-2M9V` only: text left in `AGENTS.md` is skipped |

Run I was the state this repository was in on the agent host, and it is the state the removal above ends: the same
probe on the same host, with `/home/glados/CLAUDE.md` gone, returns the repository `AGENTS.md` (3 of 3, above) — run
G's condition, restored. The original measurement has one limit worth keeping: with tools enabled, the same session
*tried* to find the rules (it ran `ToolSearch` twice and then hit `error_max_turns`), so a tool-using session under an
ancestor `CLAUDE.md` may discover them by looking even when they are not in its context at the start.

**What else it costs.**
- **The path-scoped rules.** `.claude/rules/*.md` have only one harness that reads them by path: Claude Code. Every
  other harness reaches them by hand, from the index in `AGENTS.md`. Under an ancestor `CLAUDE.md` a Claude session on
  that host also lacked that index. **Measured 2026-10-27** (Claude Code 2.1.310, tools disabled, canaries): a rule
  file *with* `paths:` loads by path without a project `CLAUDE.md` (still true with an ancestor `CLAUDE.md` present),
  and a rule file **without** `paths:` frontmatter loads eagerly at session start even under an ancestor `CLAUDE.md` —
  which is why the eager import was tried, and why the test now forbids that shape. With the ancestor file removed the
  index is in context again, so the set has its reader and its index back.
- **The invariant.** `tools/agent-config.test.ts` fails if a root `CLAUDE.md` exists, because a `CLAUDE.md` with its
  own text would be a second copy of the rules that Claude Code reads in place of `AGENTS.md` (run K); and it fails a
  `.claude/rules/` file without `paths:` frontmatter, because that file would load eagerly as a second route to the
  rules.
- **Where the gap does not apply.** A host with no `CLAUDE.md` above the checkout loads `AGENTS.md` (run G), and so
  does any harness that reads `AGENTS.md` itself (Codex reads the first 32 KiB). That is now the agent host too.

**The routes that would close the gap**, were it ever to reopen. None is needed on this host any more; the owner's:
1. **Keep a pointer `CLAUDE.md`.** A root `CLAUDE.md` holding only `@AGENTS.md`, which is option (b) and run J. The
   test would go back to pinning that import.
2. **An explicit import through settings.** Have Claude Code load `AGENTS.md` by configuration. Measured 2026-10-27: the
   builtin plugin `agents-md@builtin` has an option `instructionFiles` (`claude-md` | `claude-md-or-agents-md`, the
   default | `claude-md-and-agents-md` | `managed-only`); `claude-md-and-agents-md` loads `AGENTS.md` *beside* the
   ancestor `CLAUDE.md` (verified, with a canary). It is read **only** from user settings, `--settings` or managed
   settings — project `.claude/settings.json` is explicitly not read for plugin options — so it cannot travel in this
   repository and is the operator's, per host.
3. **An eager import in `.claude/rules/`.** A file there without `paths:` frontmatter whose body is `@../../AGENTS.md`.
   Tried as `bd46f85a` and dropped once the host condition ended; it is the repository-reachable route, and the test now
   forbids its shape, so choosing it again means changing the test deliberately.
4. **Rules only in the host file.** Put the rule text in `/home/glados/AGENTS.md`, which every checkout under
   `/home/glados` inherits. That takes the rules out of the repository, against the clean-room provenance rule that
   they are traceable here, and it was not proposed.

Removing or renaming `/home/glados/CLAUDE.md` restores run G's condition on the host; that is what was done, on
2026-10-27, and it is outside this repository.

## Specs

None. No `REQ` or `PD` governs how a coding harness loads this repository's own agent rules. The rule it puts at risk is
`AGENTS.md`'s own "Hard boundary — applies to every agent and session working in this repository", which can bind a
Claude session on the agent host only if that session reads it.

## Relevant files

- `AGENTS.md` — the rules, the one copy; its opening paragraph and "Agent harnesses — one set of files" state the
  layout and forbid an eager rule file.
- `tools/agent-config.test.ts` — fails if a root `CLAUDE.md` appears, and if any `.claude/rules/` file lacks `paths:`
  frontmatter.
- `.claude/rules/*.md` — the path-scoped rules, read by path by Claude Code; all of them carry `paths:` (the set has no
  eager member).
- `/home/glados/CLAUDE.md` (outside the repository) — the host file that shadowed `AGENTS.md` for Claude Code, moved to
  `~/.CLAUDE.md.removed-20261027` on 2026-10-27.
- `docs/architecture/first-executions.md` — the 2026-10-26 probe row and the 2026-10-27 rows for this measurement.
