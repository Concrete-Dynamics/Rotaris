# Product-owner decisions on the architecture record — Escalations ESC-19 to ESC-21 — ruled 2026-09-01, against comparative evidence

Part 6 of 15 of [the owner decisions](../owner-decisions.md), which indexes every part. Archived in [the archive](../../archive/architecture/owner-decisions/06-escalations-esc-19-to-esc-21-ruled-2026-09-01.md), one index line each here: ESC-19; ESC-20; ESC-21; ESC-26; ESC-22, ESC-24 and ESC-27 to ESC-31.

## Escalations ESC-19 to ESC-21 — ruled 2026-09-01, against comparative evidence

The product owner asked for these to be decided by comparison with how other coding harnesses solve the
same problems, rather than from first principles. Seven were examined: Claude Code, Codex CLI, Cursor CLI,
Amp, opencode, pi and Hermes. Sources are listed at the end of this section.

### What the field actually does

| Harness | Where session history lives | Format | How a project is keyed |
|---|---|---|---|
| Claude Code | `~/.claude/projects/<encoded-path>/*.jsonl` | line-delimited JSON | **encoded absolute path** |
| Codex CLI | `~/.codex/sessions/<date>/rollout-*.jsonl` | JSONL **plus a SQLite index** | generated id, no project key |
| Cursor CLI | `~/.cursor/chats/<id>/<uuid>/store.db` | **SQLite** | generated ids |
| Amp | `~/.local/share/amp/threads/*.json` + server | JSON, server-authoritative | thread id |
| opencode | `~/.local/share/opencode/opencode.db`, `%LOCALAPPDATA%` on Windows | **SQLite, WAL** | **a `project` row in the database** |
| pi | `~/.pi/agent/sessions/--<cwd>--/*.jsonl` | JSONL | **encoded absolute path** |
| Hermes | `~/.hermes/state.db` | **SQLite, WAL, FTS5** | session rows |

**Three findings, all of which bear on decisions this record has already taken.**

**Machine-local is universal.** Not one of the seven stores session history inside the user's project.
ESC-15 is not a deviation; it is what every comparable product does. opencode uses `%LOCALAPPDATA%` on
Windows — the same non-roaming location ADR-0058 chose, and for the same reason.

**SQLite is the majority and the direction of travel.** Four of seven use it, and three of those *migrated
to it*: opencode moved from JSON files to SQLite, Hermes replaced per-session JSONL with `state.db`, and
Codex added a SQLite index beside its rollouts. Hermes runs WAL "with fallback behaviour for filesystems
that cannot support WAL coordination" — the precise hazard ESC-15 identified. SR-4 is the consensus
position, not an experiment.

**The path-keyed tools have a documented, filed, painful bug — and we have already avoided it.** Claude
Code issues #33634 and #33636 record sessions being lost when a project directory is moved or renamed; one
user lost 63 sessions across 10 projects after reorganising repositories, and *even changing a folder
name's case* orphans everything. Roo Code has the identical defect, and the fix its users ask for is "a
stable `.rooprojectid` file". That is exactly what ADR-0058 already decided — a random identifier in
`.rotaris/`, deliberately not derived from the path. **This record solved the field's most-complained-of
storage defect before shipping.** That is a decision to protect against a later simplification, not to
revisit.

- ESC-19 — the backup disclosure; ruled 2026-09-01; [archived](../../archive/architecture/owner-decisions/06-escalations-esc-19-to-esc-21-ruled-2026-09-01.md#esc-19)
- ESC-20 — the export list, and where SR-6's reasoning stops; ruled 2026-09-01; [archived](../../archive/architecture/owner-decisions/06-escalations-esc-19-to-esc-21-ruled-2026-09-01.md#esc-20)
- ESC-21 — the integration lock on synchronised storage; ruled 2026-09-01; [archived](../../archive/architecture/owner-decisions/06-escalations-esc-19-to-esc-21-ruled-2026-09-01.md#esc-21)

### A consequence for ADR-0058 the comparison surfaced

opencode's ecosystem records `better-sqlite3` **failing silently under an Electron runtime** through a
native-module ABI mismatch, with the error swallowed. ADR-0058 chose `better-sqlite3`. The build toolchain
must rebuild it against the Electron ABI (ADR-0056), and a store that cannot load must fail **loudly** on
`REQ-SESSION-089`'s terms rather than be caught and degraded. Recorded so it is designed for rather than
discovered.

### Sources

- [Where Six AI Coding CLIs Store Your Session Logs](https://allaboutcoding.ghinda.com/where-ai-coding-clis-store-session-logs/)
- [Session Storage | Hermes Agent](https://hermes-agent.nousresearch.com/docs/developer-guide/session-storage/)
- [Storage and Database | sst/opencode | DeepWiki](https://deepwiki.com/sst/opencode/2.9-storage-and-database)
- [Rollout Persistence and Replay | openai/codex | DeepWiki](https://deepwiki.com/openai/codex/3.5.2-rollout-persistence-and-replay)
- [Sessions lost when project directory is moved or renamed · anthropics/claude-code#33634](https://github.com/anthropics/claude-code/issues/33634)
- [Sessions lost when project directory is moved or renamed · anthropics/claude-code#33636](https://github.com/anthropics/claude-code/issues/33636)
- [Chat history keyed to absolute project path · RooCodeInc/Roo-Code#6618](https://github.com/RooCodeInc/Roo-Code/issues/6618)
- [Codex session logs grow to 700MB-2GB · openai/codex#24948](https://github.com/openai/codex/issues/24948)

- ESC-26 — a restore may establish the workspace identifier, on explicit confirmation, and only there; ruled 2026-09-01; [archived](../../archive/architecture/owner-decisions/06-escalations-esc-19-to-esc-21-ruled-2026-09-01.md#esc-26)
- ESC-22, ESC-24 and ESC-27 to ESC-31 — ruled 2026-09-02; [archived](../../archive/architecture/owner-decisions/06-escalations-esc-19-to-esc-21-ruled-2026-09-01.md#esc-22)

### Consequences to carry

- `REQ-MONITOR-013` **survives, clarified rather than withdrawn.** Its "a run executing in a different
  process" now unambiguously means the run host as against the window — which the architecture had already
  concluded the specification implied.
- **ESC-10 is dissolved.** There is no second instance whose control must be refused. The refusal remains
  as a defence against a state that should not arise, not as routine behaviour.
- The crash domain concentrates. This sharpens the objection the record already preserves from the DATA
  architect against ADR-0002: a run-host crash loses every in-flight run at once. Named here so it is not
  discovered later.
