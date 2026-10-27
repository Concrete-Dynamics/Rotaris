## Claude Code sessions under an ancestor CLAUDE.md load no repository rules

The repository has no root `CLAUDE.md` since 2026-10-27: the owner chose option (a) on PR #28 over option (b), a root
`CLAUDE.md` holding only the import `@AGENTS.md`, and accepted the consequence explicitly, asking for it to be recorded.
This note is that record. It is a known, accepted gap, not a defect awaiting repair. It stays open while the gap
exists, and moves to `fixed/` if one of the routes below is taken.

**What breaks.** Claude Code 2.1.310 loads the first `CLAUDE.md` it finds walking up from the checkout, and once it
finds one it does not read `AGENTS.md` at all. `AGENTS.md` is only a fallback for a checkout that has no `CLAUDE.md`
anywhere above it. The Linux agent host has `/home/glados/CLAUDE.md` (the line `@AGENTS.md`, which imports
`/home/glados/AGENTS.md`, not this repository's), so on that host the fallback never triggers. A Claude session in any
checkout of this repository there starts without the repository's rules: the clean-room hard boundary, the gate, the
traceability obligation, the proof rules and the handoff shape. Nothing errors. The session simply proceeds without
them.

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

Run I is the state this repository is in on the agent host. The measurement has one limit. With tools enabled, the same
session *tried* to find the rules (it ran `ToolSearch` twice and then hit `error_max_turns`). A tool-using session may
therefore discover them by looking. They are not in its context at the start, though, and nothing guarantees it looks
before an irreversible act.

**What else it costs.**
- **The path-scoped rules.** `.claude/rules/*.md` have only one harness that reads them by path: Claude Code. Every
  other harness reaches them by hand, from the index in `AGENTS.md`. On this host a Claude session no longer has that
  index, and whether Claude Code still loads `.claude/rules/` by path without a project `CLAUDE.md` was not measured.
  So the set has lost its guaranteed reader there.
- **The invariant.** `tools/agent-config.test.ts` no longer pins the import. It now pins the opposite: it fails if a
  root `CLAUDE.md` exists, because a `CLAUDE.md` with its own text would be a second copy of the rules that Claude
  Code reads in place of `AGENTS.md` (run K).
- **Where the gap does not apply.** A host with no `CLAUDE.md` above the checkout loads `AGENTS.md` (run G), and so
  does any harness that reads `AGENTS.md` itself (Codex reads the first 32 KiB).

**The routes that would close the gap**, none of them taken, all of them the owner's to choose:
1. **Keep a pointer `CLAUDE.md`.** A root `CLAUDE.md` holding only `@AGENTS.md`, which is option (b) and run J. The
   test would go back to pinning that import.
2. **An explicit import through settings.** Have Claude Code load `AGENTS.md` by configuration, for example a
   `.claude/settings.json` or session flag that names it, instead of relying on discovery. The effect is the same as
   route 1, with more moving parts, and it was not measured.
3. **Rules only in the host file.** Put the rule text in `/home/glados/AGENTS.md`, which every checkout under
   `/home/glados` inherits through `/home/glados/CLAUDE.md`. That takes the rules out of the repository, against the
   clean-room provenance rule that they are traceable here, and it was not proposed.

The operator can also remove or rename `/home/glados/CLAUDE.md`, which restores run G's condition on the host. That
is outside this repository.

## Specs

None. No `REQ` or `PD` governs how a coding harness loads this repository's own agent rules. The rule it puts at risk is
`AGENTS.md`'s own "Hard boundary — applies to every agent and session working in this repository", which can bind a
Claude session on the agent host only if that session reads it.

## Relevant files

- `AGENTS.md` — the rules, the one copy; its opening paragraph and "Agent harnesses — one set of files" state the gap.
- `tools/agent-config.test.ts` — fails if a root `CLAUDE.md` appears.
- `.claude/rules/*.md` — the path-scoped rules, whose only reader by path is Claude Code.
- `/home/glados/CLAUDE.md` (outside the repository) — the host file that shadows `AGENTS.md` for Claude Code.
- `docs/architecture/first-executions.md` — the 2026-10-26 probe row and the 2026-10-27 row for this measurement.
