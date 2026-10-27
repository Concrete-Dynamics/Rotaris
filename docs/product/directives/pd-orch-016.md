[Product directives](../directives.md) › PD-ORCH-016

<a id="pd-orch-016"></a>

### PD-ORCH-016 — a raw-count fallback reads four consecutive calls as evidence only when they are the same action

When the loop classifier fails, or is cut at its bound, on a raw-count trigger, four or more consecutive tool calls SHALL
count as evidence of a loop only when each is the same action as the others by REQ-ORCH-101's comparison: the same tool
name and identical whole arguments, with no part of the arguments disregarded. Assistant text between the calls does not
break the run. Calls of one tool with differing arguments are counts alone, whatever the tool's facet, and declare no loop.
Every other clause of REQ-ORCH-104 and REQ-NOTIFY-109 still governs: the message limb (the last three messages with text,
normalised-equal, per OQ-126), the repetition and cycle rule, the stuck rule and the deterministic message.

**Why, and what it costs.** Finding D6 of the final duress live run at `a68f121` (session `e6747bd0`): the limb's first live
firing was on four `read_file` calls (#229 to #232) over `test/extra.test.js` and `docs/decisions.md` by a child checking its
own document; timeline entry 43 told it to "Pause and reassess read_file around docs/decisions.md …", and it spent a 24.5 s
step answering. With a model that reasons before it answers, the classifier was cut in all 9 classifications across three
duress packs (`c2fdd6a` 4, `c2a9444` 2, `a68f121` 3), so the fallback decides every raw-count activation, and the
classifier's one late answer judged edits and verification reads to be no loop. [`PD-ORCH-001`](pd-orch-001.md#pd-orch-001) is the
precedent: the owner narrowed supervision before where its unmarked "pause and reassess" fell on legitimate work. What it
costs: while the classifier is cut, a single-tool loop with varied arguments goes undeclared at a raw-count activation — it is
still ended by REQ-ORCH-102's escalation at the third consecutive activation, or bounded by the stall watch and the child's
ceiling; and the limb then adds evidence only where four identical calls follow a raw-count trigger already pending, or where
`repetition_threshold` is above 4. No tool family is exempted: the product has no read-only predicate for terminal or MCP
calls, and four different edits in a row are as ordinary as four reads.

> **Narrows:** REQ-ORCH-104, REQ-NOTIFY-109

*Cites without changing: REQ-ORCH-101 (the single sameness rule), REQ-NOTIFY-108, REQ-NOTIFY-102, REQ-NOTIFY-106,
REQ-CONFIG-467, OQ-114's kept 2.0 s bound and OQ-126's ruling on the message limb. It narrows REQ-ORCH-104's clause "≥ 4
consecutive same-tool calls" and REQ-NOTIFY-109's clause "back-to-back invocations of the same tool" alone.*

*Ruled under the owner's delegation, 2026-10-07; logged as [R-072](../requests.md#r-072), the ruling of
[OQ-232](../../architecture/open-questions.md) (finding D6). No earlier owner ruling is revised. Numbered PD-ORCH-016: fin31's
PD-ORCH-015 (P1) was assigned the number before it.*

> **First execution, 2026-10-07, built by fin32 (branch `fin32-child-reports-and-limits`):** the rule was built as written.
> `rawFallbackHasEvidence` (`packages/engine/src/run/supervisor.ts`) compares the last four tool events by `fingerprint` — the
> tool name and the whole arguments, the comparison REQ-ORCH-101's triggers already use — where it compared `event.name`;
> nothing else in the supervisor changed. **What was measured.** `supervisor.test.ts`'s REQ-ORCH-104 block: the D6 shape (two
> steps with text, each reading `test/extra.test.js` and `docs/decisions.md` with differing arguments, behind a pending
> raw-count trigger and a rejecting classifier) gives `continue`; four edits of one document with different arguments give
> `continue`; the case that pinned four greps with different arguments as evidence now gives `continue` — the three red on the
> code before — and four identical reads still give `inject`, naming "read_file around docs/decisions.md". In the built app,
> `pnpm part-h-proof`'s two new launches (`raw-count-varied`, `raw-count-same`: the tool threshold at 4, the repetition and
> cycle triggers out of reach, the classifier held past its 2.0 s bound, four `read_file` calls in one step) record no
> activation for four files and one `raw-count` activation naming `README.md` for one file read four times (green at a load
> of about 10 to 14 on four CPUs; on a build of the old comparison `raw-count-varied` was red, one activation "Pause and
> reassess read_file around docs/b.md"); a new scripted
> step, `reads4`, makes the four calls in one step, since every other scripted step speaks "Calling read_file." and would meet
> the message limb first. The text met the code in no other place. **What was not measured:** a live run since the change. The
> row is in [`../architecture/first-executions.md`](../../architecture/first-executions.md).

> **Reported back 2026-10-13 (fin41), from the live packs at `552d346` (default and duress) and `0bc3eee`**: **reached once, held, not
> discriminating.** The supervisor activated once in the three packs, at the duress orchestrator's 60th call (`#300`, `grep`,
> 09:06:51.839); the loop classifier was cut at 1,994 ms by the activation budget, the run went on 2.02 s after `#300` started
> (the loop-classification cap held), and the raw-count fallback found no evidence: the last four calls were three `read_file`
> calls on three windows and the `grep`, so `continue`, with no injection and no timeline entry. The rule's discriminating
> case was one call away: `#296` to `#299` were four `read_file` calls, which the name-only reading would have counted, but the
> trigger fell on the `grep`. No agent of either default pack came near 60 calls (25 and 37 at most). Evidence:
> [`live-552d346-duress-autopsy.md`](../../architecture/live-runs/live-552d346-duress-autopsy.md),
> [`live-552d346-default-autopsy.md`](../../architecture/live-runs/live-552d346-default-autopsy.md),
> [`live-0bc3eee-default-autopsy.md`](../../architecture/live-runs/live-0bc3eee-default-autopsy.md).
> The rows are in [`../architecture/first-executions.md`](../../architecture/first-executions.md).
