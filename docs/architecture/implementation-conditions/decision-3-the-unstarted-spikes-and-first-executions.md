# The unstarted spikes, and the mechanisms built without a condition

*Part of the register [`implementation-conditions.md`](../implementation-conditions.md), which states how an entry binds. Moved here verbatim on 2026-10-26 ([R-087](../../product/requests.md#r-087)); only relative links were re-pointed. These sections are not conditions; they were kept in the register because they say what is owed where no entry does.*

## How the unstarted spikes bind — the Architecture Gate's ruling on decision 3, 2026-09-03

**No unstarted spike is a condition of anything by itself, and none is a gate condition.** Eleven numbered
spikes have never been started and four sub-cases are owed; each one **prices a decision that has already
been taken** rather than blocking one. The ruling is that **a spike is taken as the first act of building
the thing it prices**, and its result goes into the record that made the decision — whether or not it
passes, and whether or not it found anything.

Taking them up front delays every decision they price and measures nothing that is being built yet. Leaving
them to judgement is how a measurement becomes a paragraph nobody owns; the difference between the two is
this paragraph.

**Three are named because a build reaches them first and cannot honestly proceed past them**, and naming
them is not promoting them to conditions:

- **Spike 8** — store query latency against **declared** indexes, plus store open, log recovery, an
  integrity check on the startup path, long-path behaviour, and the cost of `REQ-EVENTS-179`'s write probe.
  Spike 21 measured a schema with no indexes beyond two primary keys and one listing index, so
  `REQ-SESSION-042`'s listing budget and `REQ-TRACE-239`'s board budget are unmeasured against anything real.
  **Taken 2026-09-03 with the session writer** — `spikes/store-schema-and-open-path.md`. It found a
  declared index the planner never used, and it settled the integrity check *off* the startup path.
  `REQ-TRACE-239`'s board remains unmeasured: no board table exists yet.
  *Updated 2026-10-13: the sentence above held on 2026-09-03 and no longer does. The board was built and measured in
  wave 2 of the three-lane build (2026-09-10, merged main `7c8260c`): `REQ-TRACE-239` is met, the requirements proof
  passing six times of six on idle main, the board drawing in 38–43 ms on the fixture and 54–59 ms on 1,500
  requirements. The 103–112 ms misses measured on the branch while the machine was short of memory are kept there as a
  falsified reading (`codebase.md`, "REQ-TRACE-239 is met").*
- **Spike 18** — two run hosts on one store, which `REQ-TOOLS-089` and `REQ-SANDBOX-038` permit and which no
  spike has measured; spike 21 measured only run-host-against-workspace-service.
  **Taken 2026-09-03** — `spikes/two-writers-one-store.md`. Nothing lost, +12 % at p50, one 258 ms sample.
- **Spike 6** — the Responses dialect through the AI SDK against a non-vendor base URL with custom headers
  (ADR-0027 consequence 2). **Taken 2026-09-03 in its structural half with the adapter** —
  `spikes/responses-dialect.md`: both dialects under one base URL, the credential per request, headers,
  errors and abort all held against a fake `fetch`. **The live half is owed**: no endpoint exists on the build
  machine; the harness is gated on one the owner supplies.
  *Updated 2026-10-13: the live half has been taken twice since. On 2026-09-05 against OpenRouter
  (`anthropic/claude-haiku-4.5`) through the slice proof with the owner's own key, four of four assertions held and
  ADR-0027's fallback is no longer priced; on 2026-10-02 against a second endpoint, the owner's self-hosted vLLM
  (`spikes/responses-dialect.md`, "Status: TAKEN, both halves", and its two live-half sections).*
- **The power-loss test** — OQ-12's outstanding half, and now the **sole** stated ground for forcing the
  stronger durability setting on a terminal save. No spike has performed one, and it is the only route to an
  absent store directory that the restore's corrections do not close.
  **Taken 2026-09-04 in its harness half** — `spikes/power-loss.md`: the writer, the process-death baseline
  (ten of ten lost nothing at `NORMAL`), the verifier and its dry run (ten of ten detected a truncated tail
  exactly). **The fault half awaits the owner** — a forced power-off or a kernel crash on this machine, the
  steps and the empty table in the report's section 4. Two harness defects on first execution, in the
  report's section 6; nothing in the product.

  *Updated 2026-09-13, with OQ-12's wording closure.* The **specification** half of OQ-12 is applied:
  `REQ-SESSION-034` now defines durability in three levels — process-crash atomicity for every successful
  write, operating-system and power-loss survival for an acknowledged terminal commit and a completed backup
  artifact subject to the device honouring flushes, and a stated permitted loss of intermediate updates — and
  `REQ-LIBRARY-043` and `REQ-LIBRARY-138` cite which level they mean instead of implying one. **That changed
  nothing about this debt.** The two figures the test decides are unmeasured, the ground for forcing the
  stronger setting is unchanged, and the wording explicitly records the measurement as outstanding rather
  than resolving it by definition. The proof is tracked **per supported platform**: on Windows it is owed and
  needs the owner's physical act; on Linux and macOS it cannot be attempted at all while **IC-3** stands, so
  those two are recorded as blocked rather than owed. This entry closes only when the table is filled.

  *Updated 2026-10-26 ([R-087](../../product/requests.md#r-087)): IC-3 no longer binds Linux, so the Linux row is
  **owed** rather than blocked, as Windows is — it needs a Linux host and the physical act, not a condition lifted.
  The macOS row stays blocked while IC-3 stands. The sentence above is kept as what was true when it was written.*

## The permission gate and the first tools — 2026-09-03: no condition bound, none was downgraded

The gate (ADR-0016 to ADR-0019), the evidence rings (ADR-0024), the first eight tools and the terminal
(ADR-0020) were built and run without a condition in this file naming them and without an unstarted spike
named above pricing them. Their first-execution notes are on the ADRs that decided them; ADR-0020's holds
the seventh defect of the pattern this file's decision 3 exists for. What those notes leave owed, stated
here so it is not mistaken for discharged: the export of the four records (`REQ-SESSION-199`, ADR-0024),
the `fetch` executor over ADR-0023's classifier (needs ADR-0036), confinement (ADR-0022, no backend on this
platform), the terminal's live streaming (ADR-0021), and the sizing of ADR-0019's lapse window under load
(OQ-39 — the window is 3,000 ms as a first figure, not a measurement).

## Children and the scheduler — 2026-09-03: no condition bound; one route found missing

ADR-0012 was built and run without a condition naming it and without an unstarted spike pricing it. Its
first-execution note holds the slot-cap reading (a slot is held from the claim) and one finding: REQ-ORCH-053's
settle-on-continue sweep has no route in the product until the `continue`/`resume` controls land, because every
prompt mints a new session. Owed and stated: the loop supervisor, the fallback-model and rate-limit paths, the
artifact payload items, REQ-ORCH-030's per-item attempt limit, and the persisted `runtime.*` keys and personas
(ADR-0036).

## Lifecycle hooks — 2026-09-03/04: no condition bound; the eighth defect sat in a mechanism built earlier

ADR-0015 was built and run without a condition naming it and without an unstarted spike pricing it, with the
first slice of ADR-0036's loader beneath it. Its first-execution note holds the Windows cost of "kill the
started process only" (`cmd.exe` is never the command; a timeout always spends the 5 s grace) and the
REQ-HOOKS-013 consequence a reviewer will read as a bug. The eighth defect of decision 3's pattern was found by
it and not in it: kernel's redaction pass (ADR-0007) was quadratic and had never run at size. Owed and stated:
worktree working directories, `verifier_finished`, REQ-HOOKS-082 with checkpoints *(built 2026-10-13, fin41, N68)*, ADR-0049's single notice
slot losing the advisory, the benchmark harness for REQ-HOOKS-139.

## Intent classification and the playbooks — 2026-09-04: no condition bound; found nothing

REQ-ORCH-005..027 were built and run without a condition naming them and without an unstarted spike pricing
them; the first-execution notes are on ADR-0016 (the bundle by facet), ADR-0026 (structured output on the
port), ADR-0012 (the BUDGET clamp) and ADR-0036 (two readers). Every mechanism ran clean against the scripted
client: the four fallback arms, the ladder's degradation to text, the grant, the override, the clamp. What that
leaves owed, stated so it is not mistaken for discharged: the classifier against a real provider (the
rejection heuristic of REQ-ORCH-010 has met none); REQ-ORCH-012/013 in the product, which need a resumed
session (the same missing `continue` route as REQ-ORCH-053); the three model slots and the tier, still
environment stopgaps; plan mode (REQ-ORCH-152..154), which reads the intent and is not built.

## The build's load proof — 2026-09-04: IC-6 discharged; the ninth defect was in the renderer

ADR-0056's packaging ran for the first time under IC-6 and the condition is discharged above. Both
counterfactuals refuse at the named rule. What the run found is on ADR-0056's second execution note — the
ninth defect of decision 3's pattern was a blank packaged window, React twice in the renderer bundle, a fault
the unpackaged build shared and no test rendered. Owed and stated: the portable and its stub (ADR-0054),
signing, `REQ-STARTUP-156`'s gate, an icon, and the per-runner half (IC-3 item 3).
