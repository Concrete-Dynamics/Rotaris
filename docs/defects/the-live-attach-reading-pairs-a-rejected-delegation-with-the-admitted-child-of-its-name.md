## The live attach reading pairs a rejected delegation with the admitted child of its name

`attachReading` (`apps/desktop/scripts/lib/delegation-readings.mjs`), the live `delegation` scenario's PD-TOOLS-006 revision 5
check, reads every `delegate` call that carries a non-empty `attach_artifacts`, the ones the delegation gate rejected included.
It pairs each call with the child row of the same `task_name`, and a rejected call's result promises nothing whole (0), while
the admitted retry's child has a `context_selection` entry with `attached_included` 1. The 3c3f447 acceptance run (pack
`2026-10-14T15-58-45-917Z`, session `8de7ccb2…`) FAILED the check with "#10: the observation gave 0 whole, the entry 1": call #10
(status `failed`) read "Task 'exports-doc': rejected — This delegation names no todo item…", call #11 (status `ok`) read "1
attached artifact will be given to the child whole", and the one child `exports-doc` (`bg_50ae08b3`) has the entry
`attached_included: 1`. The product agreed with itself; the harness compared a refusal with a child the refusal never made. Found
by the acceptance round on merged main (finding L3); recorded by fin46 before the repair.

## Specs

None contradicted by the product: PD-TOOLS-006 revision 5 holds in the pack (the admitted delegation's observation and its
child's `context_selection` entry agree). The defect is the harness's reading: a rejected delegation queues no child, so it has
no entry to agree with.

## Relevant files

- `apps/desktop/scripts/lib/delegation-readings.mjs` — `attachReading`, which loops over every attaching delegate call
  regardless of its status.
- `apps/desktop/scripts/lib/delegation-readings.test.ts` — its cases, none of which carries a rejected call.
- `apps/desktop/scripts/live-run.mjs` — the `delegation` scenario's call site; `readToolCalls` already gives each call its
  `status`.
