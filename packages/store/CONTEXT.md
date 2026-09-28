# Session Record

What a session keeps, and what can leave the application. The durable store is machine-local and
only this application reads it; the exports are the one way a record reaches a stock tool on a
machine carrying none of this product's code.

Terms are derived from `docs/spec/07-sessions-persistence.md` and
`docs/spec/20-event-history-replay-export.md`. What a run *is* belongs to
[Run](../engine/CONTEXT.md).

## Language

### Where things are kept

**Durable session store**:
The machine-local store holding every session of a workspace, found through a stable workspace
identifier that travels with the workspace rather than through a path. Because it is machine-local,
backing up a workspace does not back up its sessions — a property the product states rather than
leaving a user to discover. — `REQ-SESSION-001`, `REQ-SESSION-197`, `REQ-SESSION-200`
_Avoid_: database, session directory, session files

**Record**:
Application-owned, queried, transactional state — as opposed to a **file**, which is something a
user reads or edits directly, or something a filesystem guarantee protects. Being a record says
where a thing is kept and nothing about whether the user may have a copy. — `REQ-TOOLS-190`

**Ring cap**:
The bound on how many entries a record retains. A capped record must retain enough to state how many
entries retention dropped. — `REQ-SESSION-133`

### The session's own state

**Resumable state**:
The one record carrying everything a session needs to be continued — transcript, todo state, child
states, metrics, pending questions and approvals, permission mode, worktree binding, checkpoints.
Bulk content is referenced rather than copied. — `REQ-SESSION-029`

**Conversation record**:
Every agent's conversation — the iteration root's and every child's at every depth — kept as it happens under the
agent's task id: each message the model was sent and answered, each tool call with its arguments, each tool result. A
compression is written into it as a replacement, so a resume sends the compressed conversation while the full history
stays. It belongs to its session and is deleted with it; paging the transcript never touches it, and clearing the
transcript clears the record of closed iterations only. Beside the conversation it keeps the agent's **fingerprint**:
a digest of the system instructions and the tool definitions the agent started with. A resumed agent runs with its
persona's current ones, and when they differ the run states, as a warning, which agent resumed under changed
instructions. — `PD-ORCH-005` (revision 4 clause 14)
_Avoid_: transcript (the transcript is the rows a surface draws), log, "history" alone (the event history is REQ-EVENTS')

**Open iteration**:
An iteration that has begun and not closed, recorded with its root's task id. One left open by a pause, a stop, a quit
or a crash is what the next continue resumes before anything else runs, or closes as cancelled when the user continues
without its agents. At most one iteration of a session is open. — `PD-ORCH-005`, `REQ-ORCH-072`

**Listing record**:
The small, fixed record a session browser reads, so that listing sessions never opens their full
state. A listing reads nothing else but the lock record. — `REQ-SESSION-030`, `REQ-SESSION-042`

**Repair**:
Setting a session's status to `interrupted` when the process that owned it died while its record
still asserts a run in progress. `interrupted` is a repair-only status. — `REQ-SESSION-073`,
`REQ-NOTIFY` post-crash repair
_Avoid_: recovery, cleanup

### The event stream

**Event**:
One JSON object raised by the runtime, delivered live to whatever is watching and recorded into the
session's history whether or not anything is. Masking is part of what an event **is**, not a stage
applied later, so a stored or exported event can only contain what the emitted event contained. —
`REQ-EVENTS` overview, `REQ-EVENTS-041`
_Avoid_: log line, message

**Envelope**:
The four fields present on every event — `schema_version`, `event`, `timestamp`, `session_id`. An
unknown `event` value is opaque-but-preserved when reading a store. — `REQ-EVENTS-041`

**Event history**:
The durable per-session record of events in emission order, each holding verbatim what the live
stream emitted, with at most one writer — the holder of the session's lock. — `REQ-EVENTS-080`,
`REQ-EVENTS-098`

**Truncation record**:
The record that exists only once a trim has dropped events. Its absence reads as "not truncated,
zero dropped". — `REQ-EVENTS-092`

**Replay**:
Reading a stored history back — listing, filtering and re-presenting it in the desktop interface.
It does not re-execute anything. — `REQ-EVENTS` §K, §M

### Diagnostics and evidence

**Timeline entry**:
A durable, typed entry in the session's own narrative of what happened, carrying an id, a type, a
severity, an actor and a message. The durable entry is written first and the wire event derived from
it second. — `REQ-SESSION-134`

**Issue**:
A recorded problem, carrying a kind, a severity and an `evidence_ref`. — `REQ-SESSION-135`

**Tool-call evidence**:
The record of tool-call outcomes holding the arguments an agent passed, unredacted. It is for that
reason the one record that is never offered as an export and never may be. — `REQ-SESSION-136`,
`REQ-TOOLS-190`

**Permission audit**:
The append-only record of permission decisions and mode changes, in the order the decisions were
taken, never altered. — `REQ-SESSION-137`, `REQ-TOOLS-078`

**Record locator**:
A reference from one record to an entry of another, spelled `<record kind>#<record id>`. The
record-kind token set is closed at three: `issues`, `permission_audit`, `tool_call_evidence`. A
locator is carried opaquely; no export dereferences one. — `REQ-EVENTS-056`
_Avoid_: `tool_calls` as a record kind — deliberately rejected, because that string is already a
summary count in the trajectory and metrics documents

### What leaves the application

**Export**:
A file the user is handed. A record is offered as an export when it carries no unredacted user or
tool content, and is not when it does. — `REQ-SESSION-199`, `REQ-TOOLS-190`

**Trajectory document**:
One portable JSON document per run, for offline scoring and comparison, carrying identity, outcome,
a recomputed summary and the raw stored events. — `REQ-SESSION-153`, `REQ-SESSION-193`

**Batch document**:
The wrapper several trajectories are exported in, with a closed three-key inventory
(`trajectory_version`, `count`, `trajectories`) and the documents travelling unaltered in selection
order. — `REQ-EVENTS-144`
_Avoid_: a `sessions` key — withdrawn, and no conformance test may look for it

**Line format**:
One JSON object per line, compact, keys sorted, non-ASCII escaped, one line feed on every platform.
Two equal events produce byte-identical lines. — `REQ-EVENTS-090`
