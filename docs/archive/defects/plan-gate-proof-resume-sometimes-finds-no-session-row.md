## The resumed launch sometimes finds no session row to resume

`pnpm plan-gate-proof` launches the built app four times against one workspace, each launch after the first
resuming `latest` through the session browser. On one run in four (2026-09-17, while building PD-ORCH-002
revision 2) the second launch logged `capture: no session row for "latest" in the browser` and every
assertion that depended on the resume failed — the gate "did not survive the restart" although the store
written by the first launch held the session, the pending cycle and the `plan_gate_opened` entry, as the
previous and the following runs both confirmed.

What is not yet known is which side is slow: the session browser listing sessions after the store opens, or
the capture seam reading the list at a fixed appointment rather than waiting for a row to appear. The
`ROTARIS_CAPTURE_RESUME` seam takes no "until" form, unlike `ROTARIS_CAPTURE_EVAL_AT`, so it cannot wait for
its own precondition; that asymmetry is the first thing to read.

Recorded rather than repaired: the run it interrupted passed on the next attempt, and diagnosing it means
instrumenting the session browser's load, which is wider than the change that saw it.

## Specs

No requirement is contradicted by what was observed — the store held everything REQ-ORCH-153's restart clause
requires, and a later launch read it. If the cause turns out to be the browser listing rather than the
harness, it would touch REQ-SHELL-155's session listing and REQ-ORCH-153's "the pending decision MUST survive
a restart of the application"; the evidence does not yet say that.

## Relevant files

- `apps/desktop/scripts/plan-gate-proof.mjs` — the four launches; the failure is in the second, `reopened-and-edited`.
- `apps/desktop/src/main/capture/seams.ts` — `ROTARIS_CAPTURE_RESUME` and the log line that named the miss.
- `.proof/plan-gate-proof/reopened-and-edited.log` — the failing launch's log, when a run reproduces it.

**Repaired 2026-09-22.** The note named the asymmetry to read first — `ROTARIS_CAPTURE_RESUME` takes no
"until" form where `ROTARIS_CAPTURE_EVAL_AT` does — and that is exactly what was wrong. The seam clicked
"Sessions", waited a **fixed 700 ms**, read the list **once**, and logged `no session row for "latest"` if
the browser had not finished listing by then. Nothing was wrong with the store, which is why the previous
and following runs both read the session, the pending cycle and the `plan_gate_opened` entry.

`centreWhen(host, finder, timeoutMs, what)` in `capture/host.ts` is `centre` as a **deadline** rather than
an appointment: it polls at 50 ms until the element is there or the budget is gone, and logs how much was
left when it hit. The resume seam uses it twice — 5 s for the "Sessions" control, 10 s for the row — so
neither wait lasts longer than it has to, and a slow list still reads differently from an absent row.

**Measured**, three runs of `pnpm plan-gate-proof`, all four launches each, six resumes in total:

```
capture: the "Sessions" control appeared with 4999 ms to spare
capture: the session row for "latest" appeared with 9903 … 9921 ms to spare
```

Which also answers the question the note left open — **which side was slow**. The browser lists the
session about **80 to 100 ms** after the click; the seam's old appointment was 700 ms, so the failure was an
occasional listing that ran long, not a seam that read too early in general. It cannot be reproduced on
demand, so this is not a repair proven against the failure itself; it is the removal of the fixed
appointment the failure needed in order to happen, and the margins show it costs nothing when the list is
prompt. Three runs, twelve launches, no resume failure.
