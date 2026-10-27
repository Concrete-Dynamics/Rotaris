# ADR-0046 — The transcript apply pipeline, and where determinism is enforced — First execution — 2026-09-07, the whole pipeline (Part Z)

Part 6 of 8 of [ADR-0046](../0046-the-transcript-apply-pipeline.md), which indexes every part.

## First execution — 2026-09-07, the whole pipeline (Part Z)

*Recorded under GD-10. This record carried **no execution note at all** until now.* Steps 0, 1 and 2 shipped on
2026-09-03 and were reported into **ADR-0043**'s first-execution note — the replica and the projection owner end to
end — rather than into the record that decided the pipeline. So this note covers all six steps: what the early ones
found when they ran under another record's note, and what steps 3, 4 and 5 find now.

Measured by `pnpm transcript-proof`; evidence under `.transcript-proof/`.

### Steps 0–2, as they stand (built 2026-09-03, reported elsewhere)

`packages/ui-core/src/replica.ts`. The sequence check, the three rules that make it well defined, the decline of
REQ-SESSION-161 and the reset are all there and unchanged. **One defect was found when they first ran and it is
recorded in ADR-0043 rather than here, which is the reason this note exists:** a whole-session update originally
*cleared* the rows, and the first run loop's status saves — each a snapshot — then emptied a transcript that was
still being written. The corrected rule (the rows are kept; the increment that follows an attach or a reconcile
upserts over them) is the one this note's step 3 classifies against.

**A regression check on that behaviour reaching the product end to end**, and labelled as one rather than as a first
execution: six well-formed transcript publications numbered far above the surface's expectation were delivered to
the window in one burst. The result was exactly what consequence 2 and REQ-UIBENCH-083 require —

    before  { noop: 0, insert: 1000, remove: 0, update: 0, refused: 0, reset: 1 }
    after   { noop: 1, insert: 1000, remove: 0, update: 0, refused: 1, reset: 2 }

— **one `refused`, one `reset`, five publications dropped by the subscription handler without reaching the stage,
and one `noop`**: the reconcile's increment re-delivered the same 1000 rows, and step 3 correctly classified an
application that changed nothing as a single `noop` with no row counters. The count of `refused` did not depend on
how many publications arrived inside the recovery window, which is the whole of the determinism claim.

### Step 3 — the row-level classification (`replica.ts`, `classifyRows`)

The six counters `REQ-UIBENCH-064` fixes now exist and are **separate from the seven publication classes** the
replica already had. Getting that apart mattered: the existing `counters` classify *publications* — `applied`,
`superseded`, `dropped`, `foreign`, `declined` — and the benchmark reads *rows*. `classifyRows` is pure and total:
one `insert` per row added, one `remove` per row removed, one `update` per retained row whose content changed, and
**one `noop` and no row counters** when nothing changed at all. `refused` covers both entrances — the sequence gap
and the inapplicable increment — because both are applications the view declined, and `noop` is distinguished from
it by whether the application was *valid*, never by whether pixels changed. Content equality reads the row's own
fields in **sorted key order**, so object key order cannot leak into the result.

### Step 4 — the projection (`transcript/project.ts`)

`projectDisplay` is one pure function of (resident rows, run state, grouping, caps, expansion, pending state). It
carries REQ-CHAT-047's role-to-kind mapping over the **open** role vocabulary, REQ-CHAT-048's duplicate-reasoning
hygiene, REQ-CHAT-049's dead-session hygiene, REQ-CHAT-050's edit-diff placement and its 50-line cap,
REQ-CHAT-064/065/066's folding, REQ-CHAT-166's display caps, and REQ-CHAT-051's trailer rows appended last. It is
**bounded by what changed from the first line of code**, as consequence 4 requires: `projectDisplay` takes the
previous displayed array and an earliest-changed index, walks back to the nearest group boundary at or before it,
and re-projects only the suffix; a unit test asserts the bounded result equals the whole one, including for a
change *inside* a fold. The search index is updated over the same changed suffix (`indexSuffix`) rather than rebuilt.

**REQ-CHAT-051 is met for approvals and pending for questions**, exactly as the plan predicted and for the reason it
gave: the requirement reads "N step(s) — <title of the first step>" and `SessionRecord.pendingQuestions` carries
`{requestId, prompt}` with no steps and no titles. REQ-CHAT-094 allows one pending prompt per conversation, so the
only reading the shape supports is that the **list is that prompt's steps**: N is the list's length and the title is
the first entry's prompt. Part AC widens the field; the trailer must then read the widened shape.

**REQ-CHAT-168 is asserted at zero, one and many** wherever a count is written — the trailer ("1 step", "2 steps"),
the group summary ("reading ×1 · 1 ok", "reading ×4 · 1 failed · 3 ok"), "N new update(s)" and the truncation
marker ("1 more line", "20 more lines"). No parenthetical plural is rendered anywhere.

### Step 5 — present (`transcript/TranscriptPane.tsx`)

The displayed array, the preserved anchor and the expansion map are handed to ADR-0045's recycler.

**Found — a defect the first execution caught and no reading had: showing a search match did not survive the
tail-follow pin.** REQ-CHAT-074's "showing a match disables tail-follow, selects the row, scrolls it to center"
was implemented as a scroll inside the effect that reacts to the match changing, with the state change omitted. The
first run of the proof read the count as **"1 of 1"** — the match inside a collapsed group was found correctly —
while `data-following` stayed `1`, the matched row was never bound to a slot, and every subsequent reader scroll was
dragged straight back to the tail, which also stopped REQ-CHAT-165's paging from ever triggering. Two causes, both
kept beside the fix: **the state change belongs in the handler**, where the reader's action is, not in an effect
reacting to it; and the pin effect depended on the freshly built offset table, which is a new object every render,
so it re-pinned continuously rather than when the displayed rows changed. Nothing in either record would have caught
it — the pipeline says what to compute, the recycler says what to paint, and the interaction between "the
application scrolls" and "the reader scrolls" is where they meet.

### The reading-question limbs, stated rather than reported as met

- ~~**REQ-CHAT-073 is met in one clause of two.** Its second clause — "and the Clear action MUST be disabled" — names
  an action section 14 would have built. `clearTranscript` answers `false` and no Clear action exists anywhere in
  this build, so the clause has nothing to be true of. It is not a defect and not a waiver.~~ **Corrected 2026-10-13
  (fin41): met whole.** Part AO built the toolbar's "Clear transcript" (`packages/ui/src/slash/controls.tsx`), disabled
  while the transcript holds no row, and armed `clearTranscript` in the run host (`Sessions.clearTranscript`). The
  struck reading was true when written and stopped being true with Part AO; the code comment that repeated it
  (`TranscriptPane.tsx`) is corrected in the same commit.
- **Three live-terminal clauses are implemented and left unexercised.** `CHANNEL.terminalFrames` exists in the
  contract, the relay and the preload, and **nothing publishes a frame**: ADR-0021 has no first execution.
  REQ-CHAT-063's 250 ms cadence "while a terminal stream is live" and REQ-CHAT-066's "an unsettled live terminal row
  never folds" are both written and both keyed on the `streamId` REQ-CHAT-046 puts on a row, which this part added
  to the contract for that reason. The fold exclusion is unit-tested against a synthetic row; the cadence has never
  run. Owed to the ADR-0021 part.
- **REQ-CHAT-164's detection has a window it cannot cover.** Ten seconds of provider silence marks the live row
  stalled and the next output of any kind clears the mark (`ProjectionOwner.markStalled`, published and never
  recorded, so "MUST NOT change what the transcript records" holds). But **before any output arrives there is no
  live row for the call**: this build appends the answer row on the first delta. Covering that window needs either a
  row the requirement forbids appending or a run-header indicator, which is Part AB's. Stated rather than met.
- **REQ-CHAT-002 is not met alone.** Its Ctrl+F limb lands here and closes Part W's owe; its Escape-priority limb —
  the slash suggestion popup dismissing ahead of the search panel — lands with Part AF.

### The upstream slice, which a renderer cannot repair (`engine`, `model`)

**Found — a defect no reading of the record had caught, and the plan's reading of it was wrong.** The plan said
`ai-sdk-client.ts` recognised one of REQ-CHAT-163's three reasoning shapes "so those providers' deliberation lands
in the answer body". The first half is right; the second is not, and the truth is worse. `run/turn.ts`'s stream sink
read `reasoning: () => undefined` — **every recognised reasoning delta was discarded**, so no streamed-reasoning row
has ever existed in this product, and REQ-CHAT-048's duplicate-reasoning hygiene and REQ-CHAT-062's summary had
nothing to act on. The sink now writes a `thinking` row, stamped with its start time because REQ-CHAT-059 keys
thinking rows by it, settled the moment the answer body starts. The two shapes the client did not recognise — a
thinking block inside the content and a list of reasoning items — are handled by a pure, incremental normaliser
(`model/src/reasoning.ts`) that routes thinking blocks to the reasoning channel *across delta boundaries*, separates
reasoning items by id, and **keeps a whitespace-only delta exactly as received**.

**REQ-CHAT-054 landed in the writer**, where it belongs: `SessionWriter.upsertMessageRow` keys a response segment by
a stable id, so a replayed event persists once, a cumulative committed-text snapshot updates the row in place, a
stream finalises in place, and a response after a tool boundary is a distinct row. The concrete case this repairs
was already reachable: **Part Q's ladder re-running a failed step on a fallback model appended a second `agent`
row**, because the step's row was created on the first delta of whichever attempt produced one.

`chars` and `streamId` were added to `TranscriptRowSchema` and are populated: `chars` is **derived** from the body
(the body of a thinking row is the concatenation of the deltas received, which REQ-CHAT-163 fixes character for
character) by one function called from the writer's append, the writer's settle, the owner's growth tick and the
store read — deriving it identically on both sides of the release boundary is what keeps a paged-in row identical to
the row released. `streamId` is carried and not persisted, and nothing sets it yet, for the reason above. A third
field the plan did not reserve was needed and is named here rather than slipped in: **`stalledSince`**, because
REQ-CHAT-164 splits its detection (this part) from its drawing (Part AA) and `DisplayRow` is the only channel
between them. It is published and never recorded.

### A third defect, found by the same measurement and fixed the same way

**The anchor was restored before the geometry it was restored against had settled.** REQ-CHAT-071 says "restore
that anchor after geometry settles", and a row that has just been paged in carries an *estimated* height until the
measurement pass reaches it. Restoring once, on arrival, restores against estimates, and the content then shifts
under the reader by the whole estimation error as the real heights land. The anchor is now **held** across the
settle — the effect re-runs whenever the measured total changes and re-applies it — and is released only by the
reader's own scroll or by a jump the application makes deliberately (a search match). Holding it exposed the third
part of the same fault at once: with the anchor held, jumping to a search match was pulled straight back, because
the held anchor was older than the jump. **All three are one mistake told three times** — "the application moved
the reader" and "the reader moved" had no single place where they were distinguished — and the fix is that they now
do: `programmatic`, the anchor's lifetime, and the follow state are decided in the handler that caused the movement.

### Measured

`pnpm transcript-proof`, five launches: REQ-CHAT-073's empty state word for word; ADR-0045's counts (its own note);
four consecutive same-agent `read_file` calls folding into ONE header of four whose copy reads
**"reading ×4 · 1 failed · 3 ok"** — REQ-CHAT-065's own example, with no raw tool output in it; expanding it keeping
the header on screen and revealing all four members beneath it; a search matching **inside** the collapsed group
through REQ-CHAT-065's capped member blob, landing on the visible header and turning tail-follow off ("1 of 1",
`data-following` `0`); REQ-CHAT-166's cap holding — a line past the tenth is **not displayed at all** (`0 results`
through the search index, which reads displayed rows), the truncation is marked with its size (`20 more lines`,
one match), the record still holds all thirty lines, and expanding the row shows every one of them with no marker;
REQ-CHAT-165's paging bringing 50 older rows back (1000 rows → 1050, oldest index 200 → 150) with the returned row
**identical to the row released** and the reader undisturbed to **0.25 px**; and the burst above.

REQ-CHAT-055's shown-update comparison is in ADR-0045's note. The scripted `think` step produced a
**streamed-reasoning row** in the store, which is REQ-CHAT-163 reaching a row rather than being discarded.
