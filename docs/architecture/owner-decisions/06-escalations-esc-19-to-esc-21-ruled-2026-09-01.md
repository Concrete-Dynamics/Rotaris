# Product-owner decisions on the architecture record — Escalations ESC-19 to ESC-21 — ruled 2026-09-01, against comparative evidence

Part 6 of 15 of [the owner decisions](../owner-decisions.md), which indexes every part.

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

### ESC-19 — the backup disclosure

**Decided: option 1 *and* half of option 2. Mint the disclosure requirement, and add a whole-store backup
and restore action. The configurable store location is REFUSED.**

The comparison splits option 2 into two separable things, and they have opposite evidence.

**A whole-store backup action is proven and cheap.** Hermes ships `hermes sessions backup`, built on the
store engine's own online-backup facility so it is correct *while the application is running* and safe
under write-ahead logging. It also keeps `backups/` and `state-snapshots/`. This is the right shape and we
should copy it. It does not violate `REQ-SESSION-199`'s no-duplicate-export rule, because it is a
different artifact for a different purpose: an **export** is readable by other tools, a **backup** is
restorable by us. Per-record exports were never a backup story and SR-9(b) was right that the product
currently has none.

**A configurable store location is offered by nobody, and would re-create ESC-15.** No comparable product
lets a user relocate the session *data* store. What several offer — `CLAUDE_CONFIG_DIR`, `CODEX_HOME`,
`PI_CODING_AGENT_DIR` — relocates the whole configuration directory, and the comparative survey flags
these as a hazard precisely because they "silently relocate stores" into places like Dropbox and iCloud. A
user pointing our store at a share reproduces the total outage ESC-15 exists to prevent. Refused.

**Therefore ADR-0058's location decision does NOT reopen.** The condition the registrar attached to that
reopening — taking the structural option — is not met, because the half of it that was worth taking does
not move the store.

### ESC-20 — the export list, and where SR-6's reasoning stops

**Decided: mint SR-9(a)'s two exports, and draw the boundary on redaction safety rather than on
readership.**

`REQ-TOOLS-190` currently stops the list with a *readership* argument: "that only this application reads it
is why it is a record rather than a file the user is offered." That is the wrong test, and SR-6's own
reasoning defeats it — SR-6 exists precisely because records only this application reads are still records
a user owns.

**The right test is safety, and the record already states it.** The permission audit exports safely
*because* `REQ-TOOLS-079` gives its entries no argument values. `REQ-SESSION-136`'s tool-call evidence
deliberately holds **unredacted** arguments and must never gain an export, under any later widening. The
comparison confirms this is the field's live hazard: Codex rollouts are documented as carrying "prompts,
command output, file paths, code, and accidental secrets", and opencode's export command ships a
`--sanitize` flag for exactly this reason.

So: **a record gains an export when it carries no unredacted user or tool content, and does not when it
does.** Under that rule `REQ-TOOLS-190`'s verification-gate record gains one, and `REQ-SESSION-136` never
does. That is the boundary SR-6 lacked, stated once.

### ESC-21 — the integration lock on synchronised storage

**Decided in direction, with strength pending spike 19: the product must not promise cross-machine mutual
exclusion it cannot enforce.**

There is no field precedent to borrow — every harness surveyed is single-machine, and the one with
multi-device continuity (Amp) achieves it with a server, which this product does not have and does not
want. So this is ours to reason about rather than to copy.

Exclusive create is a genuine primitive on a network filesystem and is **not** one inside a
file-synchronisation client's tree, because such clients replicate after the fact and both machines can
succeed. `REQ-GIT-128` keeps the integration lock a file specifically so a second machine meets the same
lock; on synchronised storage that guarantee is false rather than weak.

The ruling: the integration operation must **detect** the condition and refuse rather than proceed under a
lock that does not lock. This composes with SR-5, which already requires synchronised storage to be
detected directly. Spike 19 decides whether refusal is the right strength or whether a warning suffices;
it does not reopen the direction.

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

### ESC-26 — a restore may establish the workspace identifier, on explicit confirmation, and only there

**Decided: `REQ-SESSION-197` gains one narrow exception. A restore MAY establish the workspace identifier
when the user explicitly confirms it, and no other action ever may.**

**The problem.** `REQ-SESSION-201` exists so a user can carry their history to another machine. But
`.rotaris/` is gitignored, so on the ordinary recovery journey — machine dies, clone the repository, open
it once, restore the backup — the clone mints identifier **B** while the artifact carries identifier
**A**, and `REQ-SESSION-197` forbids the product touching either. The sessions restore into a store the
open workspace will never resolve to, and the only remedy is editing a file by hand. The feature is
incomplete in exactly the situation it was minted for.

**The shape of the exception, which is what makes it safe:**

- It exists **only inside the restore action**. No other path gains it — not workspace open, not repair,
  not a migration, not a future convenience.
- It requires **explicit user confirmation**, naming both identifiers and stating that the workspace's
  existing sessions become unreachable from that workspace. It is never automatic and never a default.
- The absent-identifier case is unchanged and remains **not** an exception: where no identifier file
  exists the restore establishes one by exclusive create, which replaces nothing.
- A present-but-**unreadable** identifier is still reported and never overwritten, per `REQ-SESSION-197`
  as it stands.
- The displaced store is **moved aside and kept**, never deleted, consistent with the rule that the
  application never deletes a store.

**Why the exception is drawn this narrowly.** The absolute rule is the record's best-evidenced decision:
the comparative survey found that every path-keyed harness has a filed, painful bug where moving or
renaming a project folder orphans its sessions, and `REQ-SESSION-197`'s identifier is what keeps this
product out of it. Weakening it generally would trade a common protection for a rare recovery. Confining
the exception to one user-confirmed action inside one feature keeps the protection everywhere it earns its
place, and pays for the recovery path only where a user has asked for it in as many words.

### ESC-22, ESC-24 and ESC-27 to ESC-31 — ruled 2026-09-02

Delegated to the clean-room manager and ruled together. Each is small; two of them protect a user from
losing access to their own work, which is why they are not merely tidy.

| | Decided |
|---|---|
| **ESC-22** — no requirement bounds the aggregate terminal-frame rate | **Bound it.** |
| **ESC-24** — a launch arriving inside the force-exit allowance | **Refuse the launch until exit completes.** |
| **ESC-27** — `secrets.yaml` has no file mode | **`0600`**, matching credentials. |
| **ESC-28** — a withdrawn configuration key fails the load | **Report and carry on.** |
| **ESC-29** — a withdrawn key in *global* scope stops every workspace opening | **Report and carry on**, same rule. |
| **ESC-30** — a version never recorded is indistinguishable from one pruned | **Make them distinguishable.** |
| **ESC-31** — where the permission-audit entry's identifier lives | **In the entry.** |

**ESC-22.** `REQ-MONITOR-222` now depends on this bound, which it did not when the vocabulary was written:
the IPC measurement showed a separately named channel is not a separate transport, so the coalescing cap
is what keeps a high-volume stream from delaying a transcript row. The measurement also located the cliff
— transcript p95 rose sixfold at 65.5 MB/s and ninety-eightfold at 12,000 frames per second, while
staying at 1.51 ms at 999. An unbounded rate leaves a load-bearing property resting on a default.

**ESC-24.** The force-exit allowance exists because a quit is already going wrong. Admitting a launch into
that window means two instances briefly exist, which SR-1 exists to prevent, at the one moment the product
is least able to reason about its own state. Refusing is also consistent with SR-1's own shape: a second
launch never starts a rival process.

**ESC-28 and ESC-29 together, and this is the one that matters most.** A key the product itself invited a
user to write, in a build the product itself shipped, must never make their workspace unopenable — and in
the global scope it would make *every* workspace unopenable at once, from one line in one file, with no
way in the product to reach the file that caused it. The user is told what is unsupported and what is
being ignored, and the workspace opens. This is a deliberate departure from `REQ-CONFIG-183`'s hard load
failure for an unknown key: an unknown key a stranger wrote and a withdrawn key we solicited are not the
same case, and treating them alike converts our own deprecation into their outage.

**ESC-30.** A version absent because it was never recorded and one absent because retention removed it
mean different things to a user reading an audit trail — one is a gap in the record, the other is the
record working as designed. `REQ-LIBRARY-047` makes the version write best-effort and outside the
all-or-nothing boundary, so both cases genuinely occur.

**ESC-31.** The identifier belongs **in the entry**. `REQ-EVENTS-056` requires the locator to resolve
through the export on a machine carrying none of this product's code, so an identifier held anywhere else
does not survive the export, and the export is the whole point of the audit being an audit.

### Consequences to carry

- `REQ-MONITOR-013` **survives, clarified rather than withdrawn.** Its "a run executing in a different
  process" now unambiguously means the run host as against the window — which the architecture had already
  concluded the specification implied.
- **ESC-10 is dissolved.** There is no second instance whose control must be refused. The refusal remains
  as a defence against a state that should not arise, not as routine behaviour.
- The crash domain concentrates. This sharpens the objection the record already preserves from the DATA
  architect against ADR-0002: a run-host crash loses every in-flight run at once. Named here so it is not
  discovered later.
