## slice-proof asserts a priming line the product does not write

`apps/desktop/scripts/slice-proof.mjs`, step 3 (one real run on the leased bearer), throws "the run host did not report
the priming" unless the run's log matches `/credentials: 1 provider\(s\) authenticated/`. No code in `apps/desktop/src`
or `packages/` writes "provider(s) authenticated": the run host's lease report is `LeaseReportLog`'s
"credentials: leased for <ids> (workspace <root>)" (`apps/desktop/src/run-host/launch.ts`), and REQ-PROVIDER-067's
priming report has no line of that wording. The proof therefore fails at that check on any build of the current product
once it gets that far. Not run while noticing this: the proof needs an OpenRouter key and spends against it.

Noticed while repointing the same step's lease check from main's removed "credentials leased:" line to the run host's
report (`fixed/the-repository-git-view-and-setup-step-lines-are-each-logged-twice.md`). Recorded, not repaired: which
line should stand for "the priming was reported" is the proof's owner's to choose against REQ-PROVIDER-067.

## Specs

- None contradicted by the product; the proof asserts a line no requirement names. REQ-PROVIDER-067 (the priming
  report's shape) and REQ-PROVIDER-068 (the opening report) are what the check should be read against.

## Relevant files

- `apps/desktop/scripts/slice-proof.mjs` — the stale `credentials: 1 provider\(s\) authenticated` check, beside the
  lease check this change repointed.
- `apps/desktop/src/run-host/launch.ts` — `LeaseReportLog`, the line the run host does write.
