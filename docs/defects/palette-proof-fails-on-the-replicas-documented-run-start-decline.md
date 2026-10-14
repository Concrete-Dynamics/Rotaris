## palette-proof fails on the replica's documented run-start decline

`pnpm palette-proof`'s `persona-follows-display` section (and every other section that ends in
`expect(r.errors.length === 0, …)`) counts every renderer console line as an error. One of those lines is the replica's
diagnostic "[replica] declined increment on <session>: earliest-changed 2 precedes oldest held 3"
(`packages/ui-core/src/replica.ts`, `onDiagnostic`), which is REQ-SESSION-161's own recovery at a run's start and is not a
fault: the replica declines, reconciles and draws every row
([`fixed/a-row-settled-below-the-last-is-published-without-the-rows-after-it.md`](fixed/a-row-settled-below-the-last-is-published-without-the-rows-after-it.md),
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
