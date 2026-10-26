# Architecture proposals — DATA slice — H. Delivery records and the write path

Part 9 of 25 of [the data proposal](../data.md), which indexes every part.

## H. Delivery records and the write path

**H1 — The delivery store is a directory under `.rotaris/`, and its granularity is not fixed.
(hard for location and fields; silent for layout)**
`REQ-CONFIG-192`: `requirements.delivery` holds **operational records only; requirement text is
never written there**. `store_subpath` (default `requirements`) names the directory beneath the
workspace configuration directory holding delivery records, tombstones and audit entries.
`REQ-CONFIG-010` lists it in the workspace layout.
Fields fixed: `schema_version` (int ≥ 1, default 1) written into every record; `retain_tombstones`
(default true) keeping the ids of requirements the sources have stopped declaring so a retained id
is never issued again; `audit_trail` (default true) recording each state transition with the actor,
the time, and the stated reason; `history_limit` (int ≥ 1, default **200**) history entries kept per
requirement, older pruned.
What is **not** fixed: whether a delivery record is one file per requirement, one file per
transition, or one file for the store. See **OQ-1**.

**H2 — Version handling is forward-tolerant and never destructive. (hard)**
`REQ-CONFIG-192`: "The reader supports exactly the versions **1 through the configured
`schema_version`**, which as shipped is the single version `1`; a record whose `schema_version` is
higher is reported as unsupported and is not interpreted, and a record whose value is below 1,
absent, or not an integer is reported as unreadable. **Neither is rewritten, migrated in place, or
deleted.**" Such a record is reported in exactly three places and nowhere else: the requirement is
listed on the board with its delivery history shown as unavailable **for that reason** rather than
hidden or shown as empty; the message naming the record's path and version is written to the session
log; and the same message is returned by any surface that reads delivery records. "A workspace
holding an unsupported record still opens and still runs."

**H3 — There is exactly one write path, and a guard test enforces it. (hard)**
`REQ-TRACE-382`: a closed set of **fourteen** actions, "closed deliberately so that a completeness
sweep over the action set is possible".
`REQ-TRACE-399`: "**No path anywhere in the application SHALL persist a delivery state except by
calling the engine's transition function**, and **none SHALL install the terminal state while
circumventing the completion conditions** — not via a drop, not via a context menu, and not via a
bulk operation. **A guard test SHALL assert that no module writes the delivery store directly.**"
`REQ-TRACE-403`: "**Reading and writing SHALL be separately grantable.** A component given only the
ability to read requirement data SHALL have no route by which to change a delivery state, write an
audit record or start a run, and a guard test SHALL assert that a component composed with read
access alone offers no state-changing operation at all."
That is a capability-object requirement, not a naming convention: the read handle and the write
handle must be different values, and the read handle must not carry the write methods at all.

**H4 — Every state-changing action writes a record carrying four things, and the application
refuses to start without the hash comparison. (hard)**
`REQ-TRACE-405`: who performed it, when, which requirement, and **that requirement's hash at that
instant**; interleaved in the requirement's history with runs and verifications; an action taken by
the scheduler or an agent is recorded as such and is distinguishable from one taken by a person;
"No state-changing action SHALL complete without leaving such a record."
`REQ-TRACE-402`: "A requirement whose text has changed since the snapshot its run was taken against
SHALL NOT be recordable as delivered by any route. **Where the application is assembled with a
delivery-state writer that does not make that comparison, it SHALL refuse to start** and SHALL name
the comparison that is missing, rather than starting and admitting transitions that were never
checked."
That is a startup assembly assertion with a named failure mode.
`REQ-TRACE-401`: an override requires a deliberate confirmed act with a stated reason; the record is
marked **as an override**, names who and on what grounds, and stays visible on the requirement and
in the audit trail.
`REQ-CONFIG-198` fixes what counts as **a person**: an action arriving through an interactive
surface in direct answer to a prompt the product raised for that specific action, with that surface
attached to a window. An action from an agent, a hook, a scheduled or unattended run, or a replay of
recorded events is never a person, whatever it claims about itself. The audit record names the
operating-system account the interactive session ran under together with the surface the answer came
from; the product maintains no identity of its own and asks for none.

**H5 — Restart rebuilds delivery state from what was persisted, and detects dead runs. (hard)**
`REQ-TRACE-476`: the board rebuilds, out of what was persisted, the delivery state of every
requirement, its execution units, the runs that were queued or running, and the worktrees belonging
to them. Where a run's process is no longer alive, that is detected and the run is reported as
**interrupted, with its work retained** — never displayed as still running — and its worktree, its
branch and its partial output are all kept. The queue resumes where it stopped **without re-running
completed units**, and **no requirement is silently reset** to the first column by a restart.
`REQ-TRACE-464`: while a board-started run is still executing, its **session identifier has already
been stored on the run record** — "that being the window in which the board actually needs to be
able to open the session" — and the identifier survives an application restart.
`REQ-TRACE-497` lists "a run in flight whose record carries no session identifier" as never
observable.

**H6 — Two queue controls persist and one deliberately does not. (hard)**
`REQ-TRACE-480`: automatic scheduling and the concurrency limit are written into the **workspace
configuration**; **a stop is not persisted**, so a restart never begins with the queue stopped; a
change to either persisted control takes effect without a restart.
`REQ-TRACE-481`: the concurrency control caps its own **input** at 64, and that ceiling constrains
the widget, not the scheduler — enforcement of the effective limit belongs to the engine.
