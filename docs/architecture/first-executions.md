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
| 2026-09-12 | the main window builder and the registry over MAIN windows | ADR-0048 / ADR-0055 | — | **found nothing**; the three defects it exposed were in the code it replaced, and two orderings turned out load-bearing that paper had not shown |
| 2026-09-12 | startup workspace resolution, the deferred first-paint offer, the gated replacement and the title-bar chip | ADR-0055 | eighty-eighth | the sequencing held; the built title bar had never placed the workspace chip where `REQ-SHELL-033` places it, and three obligations the flow rests on have nothing in the codebase to stand on |
| 2026-09-12 | the product-directive layer's first two directives, built | `docs/product/` (PD-SHELL-001, PD-WORKSPACE-001) | eighty-ninth | both were buildable, and **neither named every requirement it had to govern**: PD-WORKSPACE-001 needed REQ-NOTIFY-003 and REQ-NOTIFY-013 in its dispositions and named neither, which the layer's own rule (a directive governs only what it names) turns into a refusal rather than a judgement call. The verification seam written for the flow was reachable by no harness |
| **2026-09-11** | **the live run** (`pnpm live-run`) | **`AGENTS.md`** | — | **the persisted tool-call total was the entry agent's own, not the session's** (`REQ-MONITOR-102`): `sessions.tool_calls = 9` against 25 ring rows, so Overview's card read short and the synthetic run row read **0 tool calls** on any run that delegated |
| **2026-09-11** | **the requirements board against a real model** (`pnpm live-run --only=requirements`, the fifth scenario) | **`codebase.md`** (the live-run record) | **81** *(codebase)* | **a store whose every document was rejected read exactly like an empty one**: the body state was decided from the card count alone, so the board said "holds no requirement documents yet" and named nothing while the projection carried the engine's errors. Found by the hand-driven precursor; the scenario built from it then passed 21 checks at once and found nothing of its own |
| **2026-09-12** | **the shared component layer and the evidence pack a report-only critic reads** (`packages/ui/src/design-system/`, `tools/check-ui-language.mjs`, `pnpm ui-review`) | **`docs/design/README.md` §2 and §7** (R-007, classified *covered*) | **91, 92, 94–98** *(codebase)* | seven, and **five of the six were in the measuring code rather than the product** — a guard that watched only half the code that draws, a component that published another component's name into every capture, a class helper that repeated the token its caller already carried, a proof assertion falsified by a preference added the same day, and a disabled control held to the enabled contrast floor because the test read `:disabled` and the design paints `aria-disabled` the same way. The eighth was found by running the review loop rather than reading it: the iteration series keyed its directory on `HEAD`, so acting on a finding moved the revision and `iteration-2` could never find `iteration-1`'s critique |
| **2026-09-12** | **`docs/design/README.md` §5 item 1, settled from rendered pixels** — the full theme matrix through the driver (`pnpm theme-proof`, three themes × five scales, twice) | **`docs/design/README.md`** (the acceptance list) / REQ-SHELL-145, REQ-SHELL-160 (a) | **93** *(codebase)*, raised as **OQ-56** | **the acceptance item found what it had named as at risk.** The adopted `--rt-text-disabled` clears 3:1 on the page ground and misses it on every card, panel and hovered row of the default theme — 2.898:1 measured on a card at four of the five scales, and 3.030:1 at the fifth, where rounding is the entire margin; `nocturne` and `high-contrast` clear every surface. Both passes of the doubled matrix name the same strings, ratio and scales. **Not repaired** — the two ways out are a change to approved design material or an amendment to an approved requirement, and neither is an agent's to choose. Before it could be seen at all, the matrix's focus section had to stop measuring a frozen frame: thirty-two byte-identical captures had been reading as "no control paints a focus ring" |
| **2026-09-13** | **the report-only critic loop, run to a second cycle** — evidence, critique, triage, repair, re-measurement, and a second reading in a fresh context (`pnpm ui-review`, R-008) | **`docs/design/README.md` §7** / OQ-57, closed by the owner | **99** *(codebase)*, and twelve repairs measured | **all twelve cycle-1 findings repaired and measured before and after** from the packs own numbers — and the second cycle found that **three of the repairs were the same mistake in different clothes**, a bound applied to a child rather than to the box it lives in, which no assertion in the harness would have caught. Two things the loop found about ITSELF: the iteration chain broke on the round where something was repaired (defect 98), and **re-running an iteration deleted the critique written for it** (defect 99) — a capture empties its directory, and the one file in there that is not evidence is the only record of a reading. Three findings of cycle 1 were not what the critic thought: one was a REQ-SHELL-038 violation, one a declaration missing from the product entirely, and one could not be done as asked because REQ-TRACE-390 requires the accessible description to equal the visible text |
| **2026-09-13** | **the `SHRUNK` sweep** — the deterministic form of the reading that took a critic two cycles to make by hand (`shrunkBoxes` in `apps/desktop/scripts/lib/layout-relations.mjs`, reported by `pnpm ui-audit`) | **`codebase.md`** (the UI evidence record) / UIR-014 | — *(no product defect of its own; it found one the critic missed)* | **it caught the defect it was built for, and then one nobody had reported.** Proved against UIR-014 in both directions before being trusted: with the repair reverted the sweep reports `client height 56 holds content 76 and does not scroll` on the Git header — the critic's own two numbers, reached deterministically — and with it in place the box measures 830 by 830. Across fourteen captures it is quiet, with **one finding, a real one**: `table-layout: fixed` fitted the worktrees table to its card and left seven columns sharing 342 px at the minimum size, six of the seven holding content wider than their 48.56 px column and painting across their neighbours. Two candidate repairs were tried and **measured afterwards**; neither moved the number, and neither was kept. The cause is the view's split, which is the design material's call. Two lessons the check itself taught: an **ancestor's** scroll is no excuse (`.git` is `overflow: auto`, and scrolling never revealed the header's second line because the next card paints over it), and an opt-in contract catches nothing where nobody thought to publish it — `text-fit` existed all along and was on no header |
| **2026-09-12** | **the product-directive layer's enforcement** (`pnpm directive-proof`) | **`../product/README.md`** | — *(toolchain, not the product ledger)* | **the check refused a directive that displaces nothing**: the symbol generator decided whether a directive had stated a disposition by counting the requirement identifiers it named, and `New` names none, so every directive adding behaviour the product did not have before was rejected with the message meant for one that had said nothing at all. Nine of the ten counterfactuals passed on the first run — the check was not weak, it was wrong in one direction, and that direction was the strict one |
| **2026-09-13** | **OQ-8's emission trigger** — the `usage.update` cadence stated and then built (`REQ-EVENTS-053`, `pnpm exec vitest run packages/engine/src/run/run.test.ts`) | **`docs/spec/resolutions/20-event-history-replay-export.md`** / OQ-8 | — *(unnumbered; these rows are the work package's own findings)* | **a run's own token totals were short by everything a retry or a parent resume spent.** The event was raised once per *iteration* from the turn's returned report, and that report carries only the attempts that survived: `resilientStep` discards the report of every attempt it retries past, and `runWithChildren` returns the last parent turn of a resume loop. The decision's own words — *including reported failed/partial-request usage* — are what exposed it |
| **2026-09-13** | **A6's latest-run outcome derivation, reconciled against its dependents** (`readTrajectory`) | **`docs/spec/resolutions/20-event-history-replay-export.md`** / A6 | — | **a duration that belonged to no outcome.** `duration_seconds` was read off the segment's last `session.end` whatever it carried, so an end with the figure and no status exported a non-zero duration beside `status: unknown` — which `REQ-EVENTS-138` forbids in terms — and a `result` that supplied the outcome had its own duration discarded |
| **2026-09-13** | **A9's destination-failure path** — a real refusal driven to ladder exhaustion against a chosen destination | **`docs/spec/resolutions/20-event-history-replay-export.md`** / A9 | — | **the `Result` had a hole in it.** `replaceDocument` created the destination's parent outside its own `try`, so a parent that cannot be created *raised* out of `writeExport` rather than returning the recoverable refusal `REQ-TRACE-061` requires — reachable because an export's destination is one the user picked in a save dialog |
| **2026-09-13** | **OQ-42's cross-process failure propagation** — the audit of what crosses, and the desktop notice's recovery action | **`open-questions.md`** OQ-42 / `REQ-EVENTS-088` | — | **two notifications for one failure.** The engine's `persistence: {confirmed: false, …}` had no field in `RunResultSchema` and stopped at the process boundary, so main could recognise an unconfirmed completion only from a sentence and raised its own terminal notice beside the run host's — where `REQ-EVENTS-088` allows exactly one per affected run. The dependent-spec scan found two continue-on-recording-failure clauses still standing (`REQ-CLI-067`, `REQ-SESSION-145`) |
| **2026-09-13** | **OQ-46's repair announcement in the plural** (`announceRepairs`, the batch notice and its route) | **`open-questions.md`** OQ-46 / `REQ-SHELL-155` | — | **the timeline entry the requirement fixes had been invented instead.** `REQ-SESSION-062` fixes type, severity, actor, message and metadata keys; the code carried `session_marked_interrupted`, severity `info`, a two-sentence message and `previous_status` with no `execution_status`. A reader of the exported timeline could not have found the entry the specification promises |
| **2026-09-13** | **OQ-41's atomic replacement of the toolchain artifact, and the contended case staged** (`tools/symbol-artifact/replace.mjs`, `replace.test.ts`) | **`docs/spec/resolutions/08-requirements-traceability.md`** / OQ-41 | — | **three.** The ladder was ruled under OQ-44 on 2026-09-02 and **its amendment never reached `REQ-TRACE-061`**, which still said "the failure re-raised" while the register and the implementation cited the constants by name. The generator a test session runs replaced the artifact with a single `writeFileSync` **over the target** — no staging, no rename, no ladder — so a concurrent reader could observe a partial artifact, which `REQ-TRACE-502` forbids in terms. And the adapter did not catch: a throw out of vitest's `globalSetup` fails the whole run before one test is collected, which `REQ-TRACE-182` says shall never happen |
| **2026-09-13** | **the plan gate, built** — the planning phase as a run segment, its three enforcement points and its durable half (`pnpm plan-gate-proof`, schema v17) | **`adr/0062-the-plan-gate-as-a-run-segment.md`** / `REQ-ORCH-152` to `REQ-ORCH-154` | — *(unnumbered; this work package's own findings)* | **the event specification contradicted the requirement it cites.** A4's round widened `REQ-HOOKS-126`'s skip-reason set to two members; `REQ-EVENTS-047` and the `hook.finish` row of the payload table in `20-event-history-replay-export.md` both still say `untrusted_workspace` is *the only defined value*, so a reader validating against the event document alone would reject a conformant `plan_gate` event. Recorded as a defect found by building, and it owes an amendment round. **The built-app proof (`pnpm plan-gate-proof`) found a second defect, and it was in the surface this Part drew**: every behavioural assertion held first time — the pending decision and the user's edit came back from the store with the process that wrote them gone, and no file the plan named existed at any held launch — but **five consecutive captures each left some part of the gate unreachable**, and the fifth was the first where a scripted click on *Approve* actually landed. Each attempt named the same mistake in different clothes and each repair moved the casualty rather than removing it: sticky inside a tail-following log scrolled the title away, a `vh` bound measured the window instead of the column, `max-height: 100%` and then `min-height: 0` left a flex child that would not shrink, its own grid row was allocated less than its content and the transcript painted over the answers, and lowering the transcript's floor still left the buttons twenty pixels under the divider. The repair that holds is not arithmetic: the three answers are `position: sticky; bottom: 0` inside the block, so a decision the run is stopped on cannot depend on a layout sum coming out right at one window size. This is UIR-014's class — a box standing smaller than the content inside it — and **no unit test in 1,639 could have seen it**; only the pixels could. The harness taught one thing too: a synthetic `blur` reaches no React handler, because React delegates `onBlur` from `focusout`. Two things the record expected to find were **not** defects: `withholdsOn` already delivered the fail-closed reading for every MCP and plugin name with no new machinery, and the root execution record's missing identity (`docs/defects/root-execution-record-has-no-identity.md`) turned out not to block the gate at all — the note's claim that it is *the first thing that Part will need* is wrong, because nothing in a plan cycle looks the root up by name |

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

- **`codebase.md` holds the canonical defect ledger** — continuous, current, 1→87, counting *every defect the
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
