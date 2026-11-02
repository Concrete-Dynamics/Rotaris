## slice-proof asserts a priming line the product does not write

`apps/desktop/scripts/slice-proof.mjs`, step 3 (one real run on the leased bearer), throws "the run host did not report
the priming" unless the run's log matches `/credentials: 1 provider\(s\) authenticated/`. No code in `apps/desktop/src`
or `packages/` writes "provider(s) authenticated": the run host's lease report is `LeaseReportLog`'s
"credentials: leased for <ids> (workspace <root>)" (`apps/desktop/src/run-host/launch.ts`), and REQ-PROVIDER-067's
priming report has no line of that wording. The proof therefore fails at that check on any build of the current product
once it gets that far. Not run while noticing this: the proof needs an OpenRouter key and spends against it.

Noticed while repointing the same step's lease check from main's removed "credentials leased:" line to the run host's
report (`the-repository-git-view-and-setup-step-lines-are-each-logged-twice.md`, beside this note). Recorded, not repaired: which
line should stand for "the priming was reported" is the proof's owner's to choose against REQ-PROVIDER-067.

## Specs

- None contradicted by the product; the proof asserts a line no requirement names. REQ-PROVIDER-067 (the priming
  report's shape) and REQ-PROVIDER-068 (the opening report) are what the check should be read against.
- REQ-PROVIDER-068's opening report also names "the providers renewed". The wire carries that list
  (`credentials.leased`'s `report.renewed`, `packages/contracts/src/process-protocol.ts`), but `LeaseReportLog`'s line
  does not, so the proof cannot read that clause off the log. For the API key `slice-proof` leases the list is empty by
  the same requirement (a credential with no expiry is never renewed), so nothing is lost there; a proof over an
  expiring credential would need the line to carry it.

## Relevant files

- `apps/desktop/scripts/slice-proof.mjs` — the stale `credentials: 1 provider\(s\) authenticated` check, beside the
  lease check this change repointed.
- `apps/desktop/src/run-host/launch.ts` — `LeaseReportLog`, the line the run host does write.

## Outcome — repaired 2026-10-01 (branch `fin4-proof-evidence`)

Confirmed on the branch's base (origin/main 29314c0): `grep -rn "provider(s) authenticated" apps/desktop/src packages`
finds nothing, and the new test feeds `LeaseReportLog`'s real output for a primed provider to the old pattern, which
does not match it.

- The check reads REQ-PROVIDER-067/068's priming report where the run host writes it: `LeaseReportLog`'s opening line,
  `credentials: leased for <ids> (workspace <root>)[; unresolved: …]`. The new reader
  `apps/desktop/scripts/lib/priming-report.mjs` (`openingReport`, `primingProblem`) finds the first such line and
  answers why it does not show the provider primed: no opening report; `openai-compatible--openrouter` not among the
  authenticated (REQ-PROVIDER-067); or an `; unresolved:` part, so the report is not ok (REQ-PROVIDER-068). A later
  `credentials (workspace …): …` change line is not taken for the opening report.
- `slice-proof.mjs` step 3 throws "the run host did not report the priming: <why>" from `primingProblem(log3,
  PROVIDER_ID)` in place of the stale pattern. The lease check beside it
  (`/credentials: leased for openai-compatible--openrouter/`) was dropped in repair round 1: it assumed the provider
  sorts first among the authenticated, and the reader already answers whether the provider was leased.
- Pinned in `apps/desktop/scripts/lib/priming-report.test.ts`, which drives `LeaseReportLog` itself and writes its lines
  the way main's log carries the run host's: an ok report, several providers, an unresolved one, a missing provider, a
  later change line, no report, and that step 3 calls the reader and no longer holds the old pattern (that last case
  fails on the unrepaired script). Repair round 1 added that the step holds no first-place lease check, and
  that an unresolved OTHER provider's error says the proof's provider is authenticated, so the owner does not read a
  second, unauthenticated provider in the configuration as a failure to prime openrouter.
- ~~**Not run:** `slice-proof` itself. It spends against an OpenRouter key the owner has not authorized for this round
  (only the self-hosted `katalyst` endpoint is), so the repair is shown by the reader's test against the product's own
  writer and not by a run; the owner's next `slice-proof` run is its end-to-end check.~~
- **Run, 2026-10-02** (branch `fin6-slice-proof-endpoint`, R-068): the proof was retargeted from OpenRouter to the
  live-run registry's default endpoint (`katalyst`, self-hosted, unmetered, its stored key), and step 3 passed on the
  built app against it: `primingProblem(log3, 'openai-compatible--katalyst')` found the run host's opening report
  `credentials: leased for openai-compatible--katalyst (workspace …)` with nothing unresolved, and the run completed
  (`tasks_complete`, one settled tool row, the request at the registered base URL's `…/v1/chat/completions`).
  Every other scenario passed on the same fresh profile (`.proof/slice-proof/results.json` of that run; the row in
  [`first-executions.md`](../../architecture/first-executions.md), 2026-10-02).
