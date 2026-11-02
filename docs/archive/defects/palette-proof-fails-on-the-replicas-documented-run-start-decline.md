## palette-proof fails on the replica's documented run-start decline

**Outcome (2026-10-14, fin46 `accept1-6`, acceptance finding A5): repaired.** Confirmed first on the branch's base `9437077`:
`node apps/desktop/scripts/palette-proof.mjs --skip-build --only=persona-follows-display`, run six times one after another under
`xvfb-run`, went red twice (runs 3 and 6, at loads of 0.87 and 2.99 on four CPUs), each time on the one line
"[replica] declined increment on <session>: earliest-changed 2 precedes oldest held 3" and nothing else; the other four passed.
So the race is met at a low load too, not only under the load the first sighting reported.

The filter `mission-proof` kept to itself (`unexpected`) moved to `apps/desktop/scripts/lib/renderer-console.mjs` as
`unexpectedRendererErrors` (with `replicaRunStartDeclines`, the count it lets through). It matches the decline whole, positions and
all, so any other `[replica]` line and every other relayed console line still fails a check. All seven of `palette-proof`'s
`renderer errors` checks read through it, its `launch` returns `replicaDeclines`, and `results.json` keeps that count for the two
stages that start a run (`modality`, `personaFollowsDisplay`); `mission-proof`'s `unexpected` is now the shared function.

Pinned by `apps/desktop/scripts/lib/renderer-console.test.ts`: the filter lets the decline through and keeps an unrelated line and
another `[replica]` line; a decline naming no positions is still a fault; the text it matches is the one `replica.ts` writes as
`shell.ts` prefixes it; and a source-shape case that every `palette-proof` check goes through `unexpectedRendererErrors` and none
reads `errors.length === 0` (red on the base: palette-proof imported no filter), with `mission-proof`'s `unexpected` the shared one.
Shown by the proof that found it, on the repaired branch built from the same base: the same stage eight times at loads of 2.55 to
4.26, eight passes, run 3 meeting the decline (`"replicaDeclines": 1`) and passing; then the whole `palette-proof` (load 4.01 at
its start, `PART W PROOF PASSED`) and the whole `mission-proof` (load 2.32 at its start, exit 0), one after another.

Two other places read the same lines with no filter and are recorded, not repaired here:
[`notice-proof-and-two-mission-proof-checks-still-fail-on-the-replicas-run-start-decline.md`](notice-proof-and-two-mission-proof-checks-still-fail-on-the-replicas-run-start-decline.md).


`pnpm palette-proof`'s `persona-follows-display` section (and every other section that ends in
`expect(r.errors.length === 0, …)`) counts every renderer console line as an error. One of those lines is the replica's
diagnostic "[replica] declined increment on <session>: earliest-changed 2 precedes oldest held 3"
(`packages/ui-core/src/replica.ts`, `onDiagnostic`), which is REQ-SESSION-161's own recovery at a run's start and is not a
fault: the replica declines, reconciles and draws every row
([`a-row-settled-below-the-last-is-published-without-the-rows-after-it.md`](a-row-settled-below-the-last-is-published-without-the-rows-after-it.md),
"The declined increment at run start"). `mission-proof` already filters exactly that line (`unexpected`, beside its
`scenario('timed-out', …)`); `palette-proof` does not, so a launch whose run start meets the race goes red with nothing wrong
on screen.

Seen 2026-10-14 by fin45's reviewer of `fin45-retro-and-record` on the gated head `65b28c2`: `palette-proof` exited 1 at line
422 ("renderer errors: … [replica] declined increment on e26ae282-…: earliest-changed 2 precedes oldest held 3") at a load
average of about 2.4 on four CPUs, after `pnpm check` and five other proofs had run one after another; the same proof, built from
the same head and run again alone at a load of 1.5, passed ("PART W PROOF PASSED"). On the next rebased head (`31e1008`) it went red
the same way at a load of 1.7, and `node apps/desktop/scripts/palette-proof.mjs --only=persona-follows-display`, run four times one
after another at loads of 1.9 to 3.1, failed twice on that head and once in four on `origin/main` itself (`b57d1af`, built alone,
loads 3.2 to 3.7), each red on the same line. It is not the bundle's: the bundle changes no replica, publication or subscription
code, and the base without it fails the same way. Recorded, not repaired: outside that bundle's tasks.

## Specs

None contradicted by the product. The proof contradicts its own record: REQ-SESSION-161 makes the decline a recovery, and the
fixed note above says the warning is left as a diagnostic on purpose. A proof that fails on it measures load, not the product.

## Relevant files

- `apps/desktop/scripts/palette-proof.mjs` — the `r.errors.length === 0` checks (lines 178 to 422), which read every
  renderer console line, the diagnostic included.
- `apps/desktop/scripts/mission-proof.mjs` — `unexpected`, the filter that already lets the one diagnostic through and fails
  every other line; the shape a repair could share.
- `packages/ui-core/src/replica.ts` — the diagnostic's text (`declined increment on …`).
