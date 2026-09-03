# ADR-0044 — The IPC contract between renderers and the rest of the system

- **Status:** proposed
- **Date:** 2026-08-31
- **Revised:** 2026-08-31, to carry SR-3 (the sequence number on both update payloads, and the ordering
  obligation a shared counter puts on the relay) and SR-4 (alternative C re-argued now that a store
  exists).
- **Revised:** 2026-09-01. **This record was wrong about a mechanism and now says so.** Measurement
  falsified the premise that a distinct Electron IPC channel name gives terminal frames a lane of their
  own. The outcome the premise was defending still holds, but it is supplied by ADR-0021's coalescing
  cap, not by the channel split, and that cap is therefore now load-bearing for `REQ-MONITOR-222`.
- **Origin:** UI (ADR-UI-02)
- **Depends on:** ADR-0002, ADR-0010, ADR-0021, ADR-0043
- **Governed by:** `owner-decisions.md` SR-3, SR-4, SR-8
- **Evidence:** `../spikes/ipc-hop-latency.md`

## Context

`REQ-MONITOR-214` and `REQ-MONITOR-216` distinguish two update payloads with **different timing rules**
(`REQ-MONITOR-218` to `REQ-MONITOR-220`): immediate for an unseen row, a 50 ms trailing coalesce for
growth of an already-visible row. `REQ-MONITOR-217` requires the whole-session update to carry every
displayable field. `REQ-MONITOR-222` and `REQ-MONITOR-223` fix the 250 ms p95 and the ceiling of twice
the empty-session cost at 10,000 rows, **measured run to surface**.

**`REQ-MONITOR-214` puts a sequence number on the wire.** Every publication on either channel carries
one, from a single per-session counter shared by both channels, starting at 1 and raised by exactly one
per publication. `REQ-MONITOR-226` makes a number other than the expected one an obligation to
reconcile immediately, and `REQ-MONITOR-225` makes the number what identifies a superseded result. This
is the whole of how a lost update is caught: `REQ-MONITOR-288`'s reconcile poll is withdrawn,
`REQ-MONITOR-287` fixes no poll cadence, and `REQ-MONITOR-223` requires that no timer anywhere runs to
discover whether a session has changed.

`REQ-SHELL-104` and `REQ-SHELL-105` give terminal frames their own ordering discipline with sequence
numbers, at a repaint cadence of up to four times a second per stream (`REQ-CHAT-063`). **That is a
different counter with a different scope** — per stream, not per session — and the two must not be
conflated in the payload types or in diagnostics.

`REQ-MONITOR-227` and `REQ-MONITOR-225`: on focus change nothing from the previous session may survive,
and a stale read must never overwrite newer content.

`REQ-MONITOR-243`: one live session may be displayed in as many windows as the user has open at once.
Under SR-1 several main windows are ordinary (`REQ-STARTUP-163`), so one publication may fan out to
several renderers.

`REQ-NOTIFY-005`, `REQ-NOTIFY-037` and `REQ-NOTIFY-038`: an error reaches the user in two parts — a
plain-sentence headline and a **separate, selectable, copyable** detail area — so an outcome is a value,
not an exception.

`REQ-STARTUP-134` and `REQ-STARTUP-136` forbid any diagnostics file from containing session content of
any kind, and require stack frames to identify source files by base name only.

`REQ-CHAT-056` and `REQ-SHELL-095`: the renderer displays Markdown authored by a model and bytes
authored by an arbitrary process.

**What measurement has since established about the transport underneath these channels.** Two facts,
both of which change what this record may claim:

1. **A channel name is not a transport.** Every `webContents.send` for one `webContents` is multiplexed
   onto **one** IPC pipe, dispatched by **one** main-process event loop and delivered on **one** renderer
   main thread. Naming a channel `terminal:frames` does not put it anywhere different from
   `transcript:increment`. Measured against a no-load baseline of p95 1.291 ms for a transcript
   increment at 10,000 resident rows: **6× worse at 65.5 MB/s of terminal frames, 98× worse at 12,000
   frames per second.** The cost is per message rather than per byte — 49 MB/s delivered in 12,000
   frames is far worse than 65.5 MB/s delivered in 1,000.
2. **The relay meets the budgets at the rate ADR-0021 licenses.** At 999 frames/s — the ceiling the
   coalescing rule of ADR-0021 implies across the concurrent streams the runtime defaults support
   (`REQ-TOOLS-126`, `REQ-CONFIG-117`, `REQ-MONITOR-285`) — the transcript increment measured p95
   **1.514 ms**. `REQ-MONITOR-222` passes with roughly two orders of magnitude of margin, and
   `REQ-MONITOR-223` at a ratio of **1.14** against a ceiling of 2. SR-8 rules `REQ-ORCH-155`'s 100 ms a
   95th percentile, and the requirement now states that; read that way the whole-session update measures
   p95 5.95 ms unloaded and 7.81 ms loaded.

## Alternatives considered

**A — One generic bidirectional event bus.** A single tagged-message channel plus a generic
request/response.

*For:* trivial to extend; one place to instrument; easy to record and replay. **It also makes the
shared-counter ordering rule below free**, since one lane cannot reorder against itself.
*Against:* it erases the type boundary: `REQ-MONITOR-217` requires the snapshot to carry *every*
displayable field, which is a property you can only test if the payload has a declared shape. **That is
now the whole of the case against A**, and it is still sufficient.

*What this record used to add, and withdraws:* "it puts the two update payloads into one lane, and they
have **different timing rules** — a whole-session snapshot can head-of-line-block an unseen transcript
row, which is precisely what `REQ-MONITOR-218` forbids at any size." **That argument does not survive
measurement**, because named channels are one lane under `webContents.send` too. A is not worse than B
on head-of-line blocking; B has exactly the same property and this record was wrong to claim otherwise.
The argument is preserved here rather than deleted, because it is the reason the channel split was
chosen and a reader has to be able to see that the reason failed while the choice survived on its
other one.

**B — A small number of named, typed channels with a declared payload contract.** Chosen.

**C — A shared read replica in the renderer backed by a database.** *Re-argued under SR-4, because its
first stated reason no longer holds.* The earlier draft rejected this partly because "under ADR-0003
there is no database". Under SR-4 there is one — a workspace database is the store for session data.
The alternative is nonetheless still rejected, on the two reasons that were always the real ones:

- **The renderer cannot open it.** ADR-0002 gives renderers `contextIsolation: true`,
  `nodeIntegration: false` and `sandbox: true`, with no filesystem and no native module. Opening a
  store from the renderer means forfeiting exactly the isolation that makes the sandbox meaningful, in
  the process that renders model-authored Markdown (`REQ-CHAT-056`) and arbitrary process bytes
  (`REQ-SHELL-095`).
- **It cannot satisfy immediate publication on its own.** A replica the renderer reads still has to be
  told *when* to read. `REQ-MONITOR-218` forbids a delay floor of any size and SR-3 removes every
  cadence it could have been told on, so this alternative is B **plus** a second mechanism rather than
  instead of it. A change-notification feed from the store would be that push channel wearing a
  different name, and it would carry no sequence number, so a lost notification would be undetectable —
  the exact failure `REQ-MONITOR-214` exists to close.

**D — A sixth channel for reconcile requests and responses.** Rejected as unnecessary. The request is a
command and rides the existing `command` channel; the response is a whole-session update and a
transcript reset, which are the two update channels doing what they already do. Adding a channel for a
recovery path would put the recovery on a different lane from the traffic it is recovering, which is
how ordering bugs are made.

## Decision

**Alternative B**, with these specifics.

- **`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`** in every renderer. A preload
  script exposes exactly one frozen namespace built from an explicit method list.
- **Five channels**, each with a declared payload type:
  1. `transcript:increment` — session id, **sequence number**, earliest-changed index, rows, diffs,
     personas.
  2. `session:snapshot` — session id, **sequence number**, the whole-session update, bounded
     collections in full.
  3. `terminal:frames` — stream id, **per-stream sequence** (`REQ-SHELL-104`), kind, payload. **This
     is a distinct declared payload type on a distinct channel name. It is not a distinct lane, and
     nothing in this contract may be justified as though it were** — see the correction below.
  4. `notice:current` — the single current notice or null, plus the acknowledgement stream.
  5. `command` — request/response, **every command returning an explicit outcome value rather than
     throwing across the boundary**, because `REQ-NOTIFY-005` needs a headline and a detail block, which
     is a value. The reconcile request of `REQ-MONITOR-226`, the subscribe and unsubscribe of
     `REQ-SHELL-151`, and the page-older-rows request of `REQ-SESSION-192` are all commands.
- **Every payload on channels 1 and 2 carries the session id it belongs to and the sequence number the
  publisher assigned**, and the renderer discards any payload whose session is not the one it is
  currently showing. This is cheap and it makes `REQ-MONITOR-227`'s focus-change race **structurally
  impossible rather than timing-dependent**.
- **The publisher assigns the number; the transport never touches it.** ADR-0043 places the counter with
  the projection owner in the run host. Neither main nor the preload may generate, renumber or
  re-derive a sequence number, because a number added downstream would certify a delivery the publisher
  never made.
- **Order is preserved per session across both update channels, not merely within one.** Because
  `REQ-MONITOR-214` shares one counter between channels 1 and 2, a snapshot overtaking an increment
  would present as a gap and trigger a reconcile that nothing was actually lost from. The relay must
  therefore deliver channel 1 and channel 2 payloads for one session in the publisher's order. **If the
  transport cannot guarantee ordering across two channel names, the remedy is to carry both payload
  kinds on one lane discriminated by a kind tag** — keeping their distinct declared types — and **not**
  to give each channel its own counter. This obligation is stated here because it is the one property
  of the transport that the sequence contract depends on and it is invisible in the payload types.
- **A reconcile is a command, and the response is ordinary traffic.** The surface sends
  `reconcile(sessionId)` on channel 5; the owner replies by publishing a whole-session update and, for
  the transcript, an increment with earliest-changed index 0 over the resident window. The surface
  adopts the number those carry and resumes. **No new payload shape is introduced for recovery.**
- **Structured clone, not JSON strings.** The platform's IPC already uses structured clone;
  hand-serialising adds a parse on both sides for no benefit. Rows are plain objects with no class
  instances and no functions.
- **The increment is bounded by construction.** For an append it is one row. **The sender must never
  publish an earliest-changed index of 0 for anything but a genuine reset**, because doing so silently
  converts every update into a whole-transcript transfer and breaks `REQ-MONITOR-223`'s ceiling at
  10,000 rows. This deserves an assertion in the sender and a counter in diagnostics (ADR-0052),
  **beside the reconcile counter**, since a rising index-0 rate and a rising reconcile rate are the two
  ways this contract degrades into a whole-transcript transfer.
- **Versioning.** The payload contract carries a schema version. A renderer receiving a version it does
  not understand **declines every increment and re-reads** rather than guessing, which is the same path
  a sequence gap takes. The check exists for the case where a stale renderer survives an in-place
  update.
- **No credential value, and no session content bound for a diagnostics file, may appear in any payload
  type.** That is a schema assertion over the IPC surface (ADR-0030, `REQ-STARTUP-134`).

### Correction — where the isolation actually comes from

**The claim.** This record put terminal frames on their own named channel and treated that as buying
isolation: a high-volume stream could not delay a transcript row, because it was on a different channel.

**Why it is wrong.** Channel names discriminate payloads; they do not create transports. One
`webContents` has one pipe, one dispatching loop in main and one main thread in the renderer, and every
channel name shares all three. Measured, this is not a small effect: a transcript increment's p95 rose
**6× at 65.5 MB/s** and **98× at 12,000 frames per second** relative to the same increment with no
terminal traffic at all. At the top of that range the interface is two orders of magnitude outside its
no-load latency while `refused` stays 0 and nothing is dropped — so this contract's own gap detector
cannot see it.

**Where the property this record wanted actually comes from.** ADR-0021 coalesces flush-triggered frames
so the emitted rate per stream never exceeds what the bottom of `REQ-TOOLS-126`'s own range licenses. At
that rate the measurement shows no problem on any topology — p95 1.514 ms at 999 frames per second,
against a 1.291 ms baseline. **The outcome holds, and it holds because of ADR-0021's cap.**

**What follows, and it is the substantive change this correction makes:**

- **ADR-0021's coalescing cap is load-bearing for `REQ-MONITOR-222`**, not a display-smoothness concern.
  It has to be treated as a latency control: covered by a test that measures the emitted aggregate frame
  rate rather than the appearance of the grid, and changed only with that requirement in view. ADR-0021
  should carry the same statement.
- **The cap must bound the aggregate, not only the per-stream rate.** The headroom above is a per-stream
  ceiling multiplied by a bounded concurrent-stream count. Nothing establishes that background terminal
  sessions (`REQ-TOOLS-107`) cannot push that count materially higher, and the spike explicitly declines
  to answer it. **If they can, the aggregate is not bounded and this correction's conclusion weakens
  with it.**
- **A real lane is available if it is ever needed.** Terminal frames on their own transferred
  `MessagePort` measured p95 1.521 ms at 65.5 MB/s and 1.119 ms at 12,000 frames per second, against a
  0.789 ms no-load baseline — 1.4×–1.9× where the relay showed 6×–98×. ADR-0002 records the option, its
  verified compatibility with the renderer sandbox, and the one detail that defeats a first attempt at
  it. Taking it costs one more `MessageChannelMain`, and it is the remedy if the cap ever stops holding.
- **This is a mechanism correction, not a contract change.** The five channels, their declared payload
  types, the shared per-session counter and the two distinct sequence vocabularies are all unchanged.

## Consequences accepted

1. Five channels is five things to keep in step; the payload types become a shared package that both the
   publisher and the renderer depend on. That coupling is chosen deliberately so that
   `REQ-MONITOR-217` is checkable at compile time: the snapshot type has a field for every field a view
   component reads.
2. **Sandboxed renderers cannot read files or the store**, so every capability the interface needs that
   touches either — attachment thumbnails, the third-party licence bundle, the diagnostics directory,
   paging older transcript rows — must be routed through an explicit command with a validating handler.
3. Under ADR-0002 the two update channels cross **two** boundaries: run host to main, main to renderer.
   Main is a relay and must add no work on that path. **That hop has now been measured and it holds**:
   p95 1.133 ms at 0 resident rows and 1.291 ms at 10,000 against `REQ-MONITOR-222`'s 250 ms, a ratio of
   1.14 against `REQ-MONITOR-223`'s ceiling of 2, and p95 5.95 ms against `REQ-ORCH-155`'s 100 ms read
   as SR-8 rules it. Main's own cost on the path is 72–151 µs per increment and 0.5–1.1 ms per
   whole-session update. The direct message port ADR-0043 named as the remedy is **verified viable and
   held in reserve** (ADR-0002), not required. What remains true is the rule this consequence exists
   for: **main must add no work on that path**, because the relay's capacity is a message rate and
   anything main does per payload is subtracted from it.
4. **A dropped payload is observable; an overloaded relay is not.** Any hop that drops or reorders shows
   up as reconciles rather than as silent divergence — but the failure the relay actually exhibits is
   neither. Under overload it **degrades into unbounded latency with no loss at all**: every one of
   586,960 frames arrived, in order, `refused` stayed 0, and main's event-loop lag reached 22.8 s. A gap
   counter would never have fired, and the only symptom a user or a diagnostic would see is a stale
   interface. So diagnostics (ADR-0052) must carry, beside the gap and reconcile counters,
   **main's relay message rate and main's event-loop lag** — those are the two signals that move when
   this contract is in trouble, and neither is derivable from the gap counters. Distinguishing an
   overflowing subscriber queue from a slow relay remains the requirement; the correction is about which
   instruments answer it.
5. **Two sequence vocabularies exist in one contract** — per-session on channels 1 and 2, per-stream on
   channel 3 — and they must stay distinct in the types, in the diagnostics counters and in the
   language of any test. A single "sequence" field name shared across the three would invite exactly
   the conflation this consequence exists to prevent.
6. **`REQ-MONITOR-223` passes on this contract for a reason that is not in this contract.** The
   increment is one row whatever the session length, so the transport term is flat — but the measured
   ratio of 1.14 is flat mainly because the ~500 µs transport floor dwarfs the store's own per-row work.
   The idiomatic immutable append in the renderer's store is O(N) at about 2.8 ns per resident row; at
   `REQ-SESSION-192`'s 5,000-row residency cap that is ~14 µs and invisible, and it would stop being
   invisible if that cap were relaxed. **A regression in the apply stage would therefore not show up in
   an end-to-end p95.** The store apply must be measured in isolation, which is the same hazard
   ADR-0057 records for selector equality functions, now with a number against it.
7. **The cross-channel ordering obligation is not contradicted by the measurement, and is not confirmed
   by it either.** That one `webContents` is one pipe dispatched by one loop is an argument for order
   being preserved across channel names, and no reordering was observed in 46 launches including one
   that queued 586,960 frames. But the spike did not set out to falsify ordering, so the obligation
   stands as written and the merge-into-one-lane remedy stays available.

## Revisit if

Measurement shows the transport does not preserve order across channel names, in which case channels 1
and 2 merge into one lane with a kind tag as described above; or a fourth window type appears whose data
is disjoint enough to want its own lane; or ADR-0021's coalescing cap changes, is removed, or is found
not to bound the aggregate frame rate — in which case terminal frames move to their own transferred
`MessagePort`, which is the only mechanism measured to give channel 3 the isolation this record once
attributed to its name.

**Retired: the structured-clone trigger.** This record previously named "structured-clone cost dominates
the 250 ms p95 for large snapshots" as a revisit condition, with the remedy of splitting the snapshot by
collection. The measurements put it a long way off: `structuredClone` of a 4.06 KB increment costs
18.65–43.75 µs in the renderer, and quadrupling the whole-session payload from 68,858 to 283,438 bytes
multiplied the end-to-end p95 by 2.05 rather than by 4, landing at 12.179 ms. The nearer hazard on the
same path is a sporadic 88 ms `webContents.send` observed on an otherwise idle main process, which is
not a function of payload size in any way the measurement could reproduce on demand, and which no
snapshot split would address.

## Open question

The channel list is derived from the synchronisation requirements, not from the information
architecture. **If the approved design reference introduces a surface fed by data no current requirement
names, the snapshot type must grow rather than a sixth channel appearing** — `REQ-MONITOR-217` makes the
snapshot the single carrier for non-transcript state, and a sixth channel would need a counter of its
own or would break the single-counter rule.

## First execution — 2026-09-03, the walking skeleton

*Recorded under GD-10.*

**Built and run:** every renderer with `contextIsolation`, `sandbox`, no `nodeIntegration`; one
preload exposing one frozen namespace from an explicit method list (`BRIDGE_KEY`); the five channel
names with zod schemas; the command envelope returning a value rather than throwing. `shell.hello`
crossed the boundary and painted the version and workspace path it returned.

**Found, in the build rather than the contract:** the sandboxed preload failed to load on the first
run — *"module not found: child_process"* — because the bundler had inlined the `electron` npm
package's launcher shim (which requires `child_process`) into the preload. **The sandbox has no such
module and the failure is total: the bridge is absent and the renderer throws on boot.** The cause and
fix are ADR-0056's (its default external list is replaced, not merged). This is the isolated-entry
rule from the other side: a sandboxed preload cannot load a chunk, and it cannot load a Node built-in
either, so whatever is bundled into it must be pure.

**Not exercised:** the sequence contract end to end (no publisher yet). `@rotaris/ui-core`'s step-0
check is tested in a plain process against synthetic publications only.

**Found later the same day, in the relay's attachment to a window:** the application would not exit.
`app.exit(0)`, `app.quit()` and `process.exit(0)` all left the browser process alive indefinitely;
only the raw `process.reallyExit` ended it. Bisected by removing one listener at a time: the cause was
the window's `closed` handler, which read `win.webContents.id` to detach the relay - and `webContents`
on a destroyed window throws. A throw from a `closed` handler during exit is an uncaught exception,
and Electron's response to an uncaught exception in main is a modal error dialog, which no headless
run can see or dismiss. **The relay must hold the window's id, never the window**: the id is read
once at attachment and the `send` adapter checks `isDestroyed()` first. This is the shape ADR-0044's
relay was already meant to have (it fans out by id) and the composition root had not honoured it.
Two things follow for the quit choreography (ADR-0014): every `closed`, `will-quit` and
`before-quit` handler must be exception-safe, and the release gate's first-paint check must assert
the process *ended*, not only that it painted.
