# First executions

**What this register is for.** `CLAUDE.md` carries a standing policy: *a mechanism's first execution reports
back into the record that decided it, in place, including when it found nothing.* The policy is justified by a
ratio — how many mechanisms have been executed for the first time, and how many of those held a defect no reading
had caught. This file is where that ratio is **read**, not where it is asserted.

**The invariant: one row per first execution, appended, never rewritten.** The count is the number of rows. It is
written nowhere, so it cannot go stale. A correction is a **new row citing the old one**, the same shape
`docs/spec/README.md` already fixes for requirements — "a changed requirement gets a new revision, not a new
number". A row here never restates what the deciding record says; it points at it.

**What a row is.** A *mechanism* is something the architecture record decided on paper: an ADR's flow, a store,
a protocol, a harness. Its *first execution* is the first time it ran against something real. A mechanism that
ran and found nothing still gets a row — a denominator with no numerator is the whole point of keeping a ratio.

---

## Why this file exists: three counters, three numbers, no owner

Before this register there were three places counting, and on 2026-09-11 they read:

| Where | Number | What it actually counts |
| --- | --- | --- |
| `adr/0058-the-workspace-database.md` consequence 17 | **four** | the four this record itself measured — ADR-0054's two, this record's restore, and the harness built to measure it |
| `adr/0058-the-workspace-database.md`, the run-loop section (one appended sentence) | **fifty-three** | mechanisms whose first execution held a defect, project-wide, appended to since 2026-09-03 |
| `codebase.md` | **eighty** | defects found during the build, whatever found them |
| `CLAUDE.md` | fifty-three **+ four + one** | the middle one, plus the build toolchain's and the relay's |

None of them is wrong on its own terms and no two are comparable, because no two count the same thing and none
says which it counts. Two further facts make the drift concrete rather than theoretical:

- **The sequences overlap and contradict.** ADR-0058 numbers the composer and structured questions **48–53**
  (Parts AB/AC, 2026-09-07). `codebase.md` numbers Part AL's **50–52** and Part AM's **53–55** (2026-09-09) — a
  different sequence over the same integers. Wave 1's renumbering in merge order is where the collision becomes
  visible; it is not where it starts, which is Part Y on 2026-09-07. See the reconciliation at the end.
- **`CLAUDE.md` cites a number its source does not carry.** It attributes fifty-three to "ADR-0058 consequence
  17"; consequence 17 says four. The fifty-three is in a different section of that ADR, inside a single sentence
  several thousand words long that has been appended to for two months.

This register takes the **ratio** question and nothing else. `codebase.md` keeps its defect ledger; the two now
name each other and neither restates the other's number.

---

## The register

Rows are grouped exactly as the record that reported them grouped them; where a record counted several findings
as one execution, the row says so. **A row's identity is date + mechanism + deciding record, never an integer.**
The `#` column reports what a source ledger called the finding and says which ledger, because there are two and
they diverge (see the reconciliation below); this file assigns no numbers and renumbers nobody's record.
**An unlabelled number is ADR-0058's sequence; *(codebase)* marks `codebase.md`'s.** One integer of ADR-0058's
sequence has no row here: that sentence opens its count at "six times" and never identifies the fifth, so this
file leaves the hole open rather than inventing a row to fill it.

| Date | Mechanism (first execution) | Deciding record | # (and whose ledger) | What it found |
| --- | --- | --- | --- | --- |
| 2026-09-03 | the packaged-launch commit step | ADR-0054 | 1 | renamed a prepared directory onto an existing one; a damaged preparation was never repaired |
| 2026-09-03 | the packaged-launch completeness check | ADR-0054 | 2 | passed a preparation whose image was damaged; the launch produced nothing |
| 2026-09-03 | the store's restore | ADR-0058 | 3 | could not complete, destroyed a live session through a gate evaluated too early, reversed itself with the call that had just failed |
| 2026-09-03 | the harness built to measure that restore | ADR-0058 / `spikes/corrected-restore-rerun.md` | 4 | three defects, one of which would have **passed while testing nothing it claimed to test** |
| 2026-09-03 | the replica behind the run loop | ADR-0043 | 6 | cleared its transcript on every whole-session update |
| 2026-09-03 | the terminal against a real PTY | ADR-0020 | 7 | the first permission-gate mechanism to meet something real |
| 2026-09-03 | the event ring at size | ADR-0007 | 8 | found by the first mechanism to run it at size, not by its own first execution |
| 2026-09-04 | the first packaged launch | ADR-0056 (2nd execution) | 9 | blank window; React twice in the renderer bundle; no test rendered it |
| 2026-09-05 | the loop supervisor | ADR-0059 | 10 | triggers judged over a series holding text beside tool calls; REQ-ORCH-101's triggers are over actions |
| 2026-09-05 | the configuration writers | ADR-0036 | 11 | the in-place edit re-emits a file with an inline comment's spacing collapsed |
| 2026-09-05 | the control channel | ADR-0010 (2nd execution) | 12 | the turn's peek for a pending steer read through the port that drains |
| 2026-09-05 | the credential store | ADR-0029 (spike) | 13 | the apply step left a foreign explicit ACE in place; `/reset` now precedes the grant |
| 2026-09-05 | the slice's first sign-in | ADR-0037 | 14 | the snapshot reload kept pending Settings state, showing defaults over discovered picks |
| 2026-09-05 | the first real model call | ADR-0027 | 15 | the system prompt travelled inside `messages`; the SDK refuses it before any request leaves |
| 2026-09-05 | the classifier ladder's first real call | ADR-0026 | 16 | the strict rung carried no instruction; the model answered the request instead of labelling it |
| 2026-09-05 | the Overview | ADR-0055 | 17 | the window paints before the workspace opens; the first reads were refused |
| 2026-09-05 | the preference store's first nested value | ADR-0042 | 18 | the serialiser's key list filtered every level; a pane layout stored as `{}` |
| 2026-09-05 | the `fetch` tool | ADR-0023 | 19 | the entry role was recognised by a parent id the run had already renamed |
| 2026-09-05 | the resilience paths | ADR-0027, ADR-0012 | 20–23 | a transient retry would have replayed executed tool calls; three more |
| 2026-09-05 | checkpoints | ADR-0039 over ADR-0038 | 24–26 | the network chokepoint took the first non-option argument as the subcommand; two more |
| 2026-09-05 | the Git view's helper and reads | ADR-0038 (2nd execution) | — | **found nothing** |
| 2026-09-05 | the agent surfaces | ADR-0048 (1st), ADR-0043 (4th) | 27–28 | every window's subscription bound to the main window's sink; the ledger's changes reached no surface for up to 10 s |
| 2026-09-05 | the MCP client | ADR-0033, ADR-0034 | 29 | the platform's spawn helper could not start a `.cmd` runner on Windows; the shipped default could never start |
| 2026-09-06 | the session browser's actions | ADR-0005, ADR-0024 | 30–32 | a second liveness predicate that disagreed with the one; two more |
| 2026-09-06 | the Serena bundle | ADR-0035 | — | **found nothing in existing code**; its findings were the platform's and the runtime's |
| 2026-09-06 | Parts V and W | ADR-0049, ADR-0048 | 33–34 | recorded in `CLAUDE.md` rather than in ADR-0058 |
| 2026-09-07 | the Library shell and Prompts tab | ADR-0042 (4th), this store and DAL | — | **found nothing** |
| 2026-09-07 | the session artifact store, its tab and renderer | ADR-0003, ADR-0051 | 35–37 | a directory the flat body naming never creates; a sentence worded twice; a vanishing elision marker |
| 2026-09-07 | the transcript, built as two halves in parallel | ADR-0045, ADR-0046 | 38–47 | the reader's place had no owner; every reasoning delta discarded at the sink; seven more |
| 2026-09-07 | the composer and the structured questions | Parts AB/AC records | 48–53 | the control channel could not express REQ-CHAT-095's answers map; five more |
| 2026-09-08 | context compression (Part AH) | ADR-0060 | 41–45 *(codebase)* | five, **three of them found only on the first live call against a real provider** |
| 2026-09-09 | the traceability engine (Part AJ) | ADR-0040 | 47–49 *(codebase)* | three; spike 7 taken with it |
| 2026-09-09 | the delivery store and requirements contracts (Part AK) | ADR-0041 | 46 *(codebase)* | one at the Part, and `sessions-proof`'s fifteen-table cascade pin at the merge-1 proof pass |
| 2026-09-09 | the terminal stream in the run host (Part AL) | ADR-0021 | 50–52 *(codebase)* | three, the last being two registered keys nothing read |
| 2026-09-09 | the terminal grid and pop-out content (Part AM) | ADR-0047 | 53–55 *(codebase)* | three, over a scripted frame source |
| **2026-09-11** | **the live run** (`pnpm live-run`) | **`AGENTS.md`** | — | **the persisted tool-call total was the entry agent's own, not the session's** (`REQ-MONITOR-102`): `sessions.tool_calls = 9` against 25 ring rows, so Overview's card read short and the synthetic run row read **0 tool calls** on any run that delegated |
| **2026-09-11** | **the requirements board against a real model** (`pnpm live-run --only=requirements`, the fifth scenario) | **`codebase.md`** (the live-run record) | **81** *(codebase)* | **a store whose every document was rejected read exactly like an empty one**: the body state was decided from the card count alone, so the board said "holds no requirement documents yet" and named nothing while the projection carried the engine's errors. Found by the hand-driven precursor; the scenario built from it then passed 21 checks at once and found nothing of its own |
| **2026-09-12** | **the product-directive layer's enforcement** (`pnpm directive-proof`) | **`../product/README.md`** | — *(toolchain, not the product ledger)* | **the check refused a directive that displaces nothing**: the symbol generator decided whether a directive had stated a disposition by counting the requirement identifiers it named, and `New` names none, so every directive adding behaviour the product did not have before was rejected with the message meant for one that had said nothing at all. Nine of the ten counterfactuals passed on the first run — the check was not weak, it was wrong in one direction, and that direction was the strict one |

---

## The two ledgers, reconciled — 2026-09-11

The reconciliation this file first recorded as owed is done. It did not resolve the way the note assumed, and
the note's reading is kept here beside its replacement: it said the overlap was *"between `codebase.md`'s 46 and
60"*, produced by wave 1 renumbering in merge order. That is where the collision is **visible**; it is not where
it starts.

**The two sequences diverge from Part Y (2026-09-07), not from wave 1.** ADR-0058's sentence numbers the session
artifact store **35–37**; `codebase.md` numbers the same Part's findings **33–36** — three against four, already
offset by two before wave 1 was planned. From there the sequences drift independently: ADR-0058 reaches 53 at
Parts AB/AC on 2026-09-07 and stops; `codebase.md` reaches 45 at Part AH on 2026-09-08, then wave 1 renumbers
its five Parts in merge order from 46 and carries on to **80**.

**They cannot be merged into one integer line, and must not be.** Doing it would renumber one record's findings
inside the other's, which is precisely what "a changed requirement gets a new revision, not a new number"
forbids by analogy. So:

- **`codebase.md` holds the canonical defect ledger** — continuous, current, 1→80, counting *every defect the
  build found, whatever found it*. **Anywhere but this file's own table, a number cited without a ledger means
  this one**; inside the table the historic rows predate it, so there an unlabelled number is ADR-0058's.
- **ADR-0058's sentence is a superseded parallel narrative**, 1→53, closed on 2026-09-11, counting *mechanisms
  whose first execution held a defect*. It is kept verbatim because its reasoning is cited elsewhere; its
  integers are historic and are never to be continued.
- **This register counts neither.** It counts **first executions** — one row per mechanism that met something
  real for the first time, including the ones that found nothing. Its rows carry a source number only as a
  cross-reference, always labelled.

**What is therefore *not* a row here, and why.** A merge defect, a proof defect and a gate finding are not first
executions of a mechanism the architecture record decided — they are the build finding its own faults, which is
`codebase.md`'s ledger. Named so the exclusion is checkable rather than implied: the merge-1 defects (59, 60),
the wave-2 merge's three (61–63), the palette count pins and their neighbours (64–67), the proof that read the
wrong store (68), and wave 3's twelve (69–80, including **T2-1** at 78 and **C2-1** at 79). Part AN (2026-09-09,
defects 56–58) is excluded on the same principle for the opposite reason: it executed ADR-0050 a second time,
ADR-0049 a third and ADR-0048 a second, so it holds no first execution at all.

**The tail is short because it is finished, not because it is unwritten:** between Part AM (2026-09-09) and the
live run (2026-09-11) **no ADR was first executed**. Waves 2 and 3 closed lanes that already had one.

---

## How to append

When a mechanism runs for the first time:

1. record what it found **in the record that decided it**, in place, as `CLAUDE.md` requires — including when it
   found nothing, and keeping any falsified reason beside its replacement;
2. **append one row here**, pointing at that record.

Two writes. The second is mechanical and a reviewer can check it at a glance: a part that closes without a row
is as visible as a stale architecture view, and refusable on the same ground.
