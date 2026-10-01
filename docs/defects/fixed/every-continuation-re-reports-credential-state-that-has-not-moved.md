## The credential report was written out three times a prompt, naming the same expired credential each time

A continuation re-leases the bearers from main: `continuationLeaseForSession` runs on
`session.continue`, `session.prompt` **and** `session.planDecision` (ADR-0030, REQ-PROVIDER-066 — the
standing substitute for REQ-PROVIDER-068's keep-fresh timer, and the thing that fixed the
continuation's 401). Each re-lease asked main for every provider any configured model names, used or
not, and both processes then wrote the answer to the log unconditionally. One prompt on a workspace
with two unauthenticated providers produced, every time:

```
run host info: credentials: re-leased for openrouter (continuation, workspace …)
[main …] credentials leased: openrouter; unresolved codex (Authentication expired; re-authentication
required.), copilot (Authentication required)
```

Nothing was retried and nothing failed — the state was simply restated. REQ-PROVIDER-068 says an
unresolved credential "is reported once in the opening report instead of producing a warning at every
check", and three restatements a prompt are what that sentence exists to prevent.

## Specs

- `REQ-PROVIDER-068` — the opening report is the place an unresolved credential is named; a check is
  not. The lease itself is kept: this product performs it per continuation deliberately.
- `REQ-PROVIDER-067` — the priming report's shape, unchanged; what moved is how often it is written.

## Relevant files

- `apps/desktop/src/run-host/launch.ts` — `LeaseReportLog` (new): the first report per workspace root
  is written whole, an identical one is silent, and a changed one says what changed. A change that is
  neither a provider gained nor a reason altered falls back to the whole sentence rather than to
  silence.
- `apps/desktop/src/run-host/index.ts` — both lease paths, the launch and the continuation, now go
  through it instead of each logging their own way.
- `apps/desktop/src/main/index.ts` — main's own `credentials leased:` line is not repeated when it is
  the same sentence as the last one. Superseded 2026-10-01, kept beside its replacement: main no longer writes that
  line at all, because it restated the run host's `LeaseReportLog` report of the same lease (PD-MONITOR-002,
  [the-repository-git-view-and-setup-step-lines-are-each-logged-twice.md](the-repository-git-view-and-setup-step-lines-are-each-logged-twice.md)).

## Examined and found innocent — the reasoning that was wrong before it was written

The plan for this repair said `SignIn.lease()` should record a provider's error "only on change",
because re-recording was thought to be what made the two reasons reappear. It is not:
`recordError` sets one entry in a `Map`, `lastErrors`, which is read only by `lastError(id)` for the
provider list's `lastError` field. Writing the same string over itself changes nothing anyone can
observe, and `clearError` on a successful lease is what the field needs to stay truthful. The
duplication was entirely in the two log lines. `signin.ts` is therefore untouched, and the reasoning
is kept here rather than quietly dropped.

## Repaired — 2026-09-16

Regression test: `apps/desktop/src/run-host/launch.test.ts` — "REQ-PROVIDER-068: the opening report is
whole, an unchanged one is silent, and only a change is said", which drives one launch, three
continuations over unmoved state, a provider that authenticates, a reason that changes, a second
workspace root and a lease main did not answer.
