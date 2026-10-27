# Architecture proposals — DATA slice — B. Write discipline: atomicity, ordering, durability

Part 3 of 25 of [the data proposal](../data.md), which indexes every part.

## B. Write discipline: atomicity, ordering, durability

**B1 — Atomic whole-file replacement is required for every store this slice owns. (hard)**
Stated independently in five places, with the same mechanism each time: stage beside the target,
then replace.
`REQ-CONFIG-027` (bootstrap: staged beside the target, mode `0644`, "a crash mid-write can never
leave a truncated `agents.yaml`, and no temporary file is left behind on any path"),
`REQ-CONFIG-212` (snapshot writes), `REQ-CONFIG-216` (secrets), `REQ-CONFIG-013` (the `.gitignore`
maintenance write), `REQ-CONFIG-444` (every writer of `agents.yaml` leaves mode `0644`),
`REQ-LIBRARY-043` (improvement artifacts: "at any instant a concurrent read returns either the
complete previous file or the complete new one, never a partial, empty, or unparseable file"),
`REQ-LIBRARY-049` (history versions), `REQ-LIBRARY-087` (session artifact store),
`REQ-LIBRARY-138` (prompts, temp prefix `.rotaris-prompts-`), `REQ-LIBRARY-151` (persona memory),
`REQ-TRACE-061` (generated artifact: "a temporary file created in the target's own parent
directory"), `REQ-TRACE-126` (baselines), `REQ-TRACE-137` (tombstone log — atomic *because* the log
is append-only evidence that cannot be reconstructed), `REQ-EVENTS-091` (the event trim replaces the
file in one atomic step).

**B2 — The temporary file must be created in the target's own parent directory. (hard)**
`REQ-TRACE-061` and `REQ-TRACE-126` say so explicitly. This is not a style note: a rename is only
atomic within a filesystem, and the workspace, the per-user config directory and the per-user data
directory can each be on a different volume. It also interacts with **B3**.

**B3 — A transient file must never be mistakable for a real record, and must be gone afterwards
whether the write succeeded or failed. (hard)**
`REQ-LIBRARY-043` states both halves for the improvement store, and the listing rule it must not
collide with is `REQ-LIBRARY-045` (ids are file stems, sorted lexicographically). `REQ-LIBRARY-049`
adds that `history/` can never collide with an artifact file because artifact ids carry the
`impart_` prefix and `history` is not a `.json` file at that level. `REQ-LIBRARY-138` fixes the
prompts temp prefix as `.rotaris-prompts-`. `REQ-CONFIG-027` and `REQ-CONFIG-212` require no
temporary file left behind on any path. `REQ-TRACE-061` requires best-effort removal on failure and
re-raise.

**B4 — Windows replace contention must be retried, and two domains fix two different retry
schedules. (hard, with a conflict to resolve)**
`REQ-LIBRARY-043`: "up to 5 attempts in total, with a non-zero pause before each retry"; **all 5
attempts must complete within 1 second of the first**; the individual delays are explicitly not
observable and must not be relied on.
`REQ-SESSION-033` (adjacent slice, quoted in domain 07's constants table): 5 attempts, backoff
`0.05 / 0.1 / 0.2 / 0.4 / 0.8 s` — which sums to 1.55 s and therefore **cannot** satisfy
`REQ-LIBRARY-043`'s one-second bound.
The two are compatible only if the retry schedule is a parameter of the write primitive rather than
a constant inside it. Recorded as open question **OQ-3**.

**B5 — File mode `0644` on POSIX for every `agents.yaml` writer and for the discovery snapshot;
platform default where there is no POSIX mode. (hard)**
`REQ-CONFIG-027`, `REQ-CONFIG-212`, `REQ-CONFIG-248`, `REQ-CONFIG-441`, `REQ-CONFIG-444`.
Note the asymmetry: `secrets.yaml` is *not* given a mode by `REQ-CONFIG-216`, which requires only
atomicity, directory creation, and staged-file removal on failure.

**B6 — Cross-file write ordering is fixed in five places, and each ordering exists to make a crash
survivable. (hard)**
- The retired-identifier log is written **before** the new generated artifact, "so that a crash
  between the two leaves the identifier recorded rather than forgotten" (`REQ-TRACE-133`).
- A `checkpoint.created` event does not become observable until the session snapshot lists the
  checkpoint, the list has been trimmed to the retention limit with the trimmed refs deleted, and
  `timeline.jsonl` holds the entry (`REQ-GIT-048`). A consumer reading the snapshot on receipt of
  the event always finds both the checkpoint and the honoured retention limit.
- A safety checkpoint is recorded, and must succeed, before a restore touches a file
  (`REQ-GIT-058` gate 5); failure to create or persist it stops the restore with no file modified.
- A `pre_rollback` checkpoint is recorded before an improvement rollback restores the tree; failure
  blocks — "an irreversible rollback is forbidden" (`REQ-LIBRARY-075`, `REQ-LIBRARY-163`).
- Retention trims the Git refs and the recorded list **together**, so no operation of domain 06 ever
  leaves a recorded checkpoint without its ref (`REQ-GIT-049`).

**B7 — Some writes are best-effort by requirement, and their failure must not fail the operation.
(hard)**
`REQ-LIBRARY-047`: when the artifact file is written but its history version cannot be, the save
**still reports success**, the user's change still takes effect, and the failure appears only in the
application log — "review decisions, edits, and deletions therefore keep working in a workspace
whose `history/` directory cannot be written."
`REQ-CONFIG-013`: every failure of the `.gitignore` maintenance write is swallowed and never fails
the configuration load.
`REQ-GIT-069`: checkpoint ref cleanup on session deletion is best-effort and never blocks deletion.
`REQ-GIT-133`: the integration worktree removal after a successful promotion is best-effort and a
failure does not turn a completed promotion into a reported failure.
`REQ-GIT-045`: automatic capture never raises and never aborts the run.

**B8 — "No surface writes a configuration it cannot load back." (hard)**
`REQ-CONFIG-458`. Reinforced by `REQ-CONFIG-442`: the scoped per-field writer **refuses** when the
existing file cannot be parsed or parses to a non-mapping — nothing is written, the file is left
exactly as it stands, and the user is told which file and what the parse fault was. And by
`REQ-CONFIG-256`/`REQ-CONFIG-259`: the desktop save refuses a non-mapping file with an error
identifying which file. `REQ-CONFIG-260` requires the whole save to be validated **before any file
is touched**, so a rejected save leaves the workspace file byte-identical and still loadable.
The one deliberate exception is `REQ-CONFIG-257`: a pre-existing non-mapping value *at one of the
sections the desktop save writes into* is silently replaced with a fresh mapping.

**B9 — Writers preserve key order and lose comments. (hard)**
`REQ-CONFIG-248` and `REQ-CONFIG-441`: written atomically "with the file's key order preserved and
never alphabetized". `REQ-CONFIG-199`: the discovery snapshot is written with insertion order
preserved, not alphabetised. `REQ-CONFIG-252` is explicit that everything the startup-preference
write does not touch round-trips through parse-and-re-emit, and that **"comments and formatting are
lost while content is preserved — the observable cost of editing models from a UI"**.
Preserving comments would exceed the requirement rather than violate it, and it changes what a user
sees; see **ESC-2**.

**B10 — Reading a workspace never rewrites it. (hard)**
`REQ-TRACE-090` (verification is pure: returns lists, logs nothing, writes nothing),
`REQ-TRACE-152` (the toolchain writes *only* under the regeneration and baseline-update actions),
`REQ-TRACE-408` (showing an offer, dismissing one, opening the board, reading it and changing the
grouping axis each write nothing), `REQ-TRACE-510` (baseline update is invoked deliberately and is
never a consequence of opening or reading the board), `REQ-LIBRARY-051` ("opening a workspace never
rewrites untouched files"), `REQ-CONFIG-419` (no reload path may emit a change notification; a
reload must never write back what it just read), `REQ-TRACE-497` (a write produced by rendering,
dismissing, opening, reading or re-grouping is never observable).
The single stated exception is `REQ-CONFIG-013`'s best-effort `.gitignore` line, which is a write
performed on **every** configuration load.
