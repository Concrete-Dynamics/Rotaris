## `directive-proof` fails on clean `main`: the HTML-comment template check cannot pass

`pnpm directive-proof` fails on a clean checkout of `main` (verified on `f60ee29`,
2026-09-14) at the check "the template inside the HTML comment is not parsed as a
directive" — 24/25 checks pass and the script exits 1. Nothing about the template
comment in `docs/product/directives.md` changed recently; the failure reproduces with
no working-tree modifications, so the check is red independent of any directive work
and fails `pnpm check`-adjacent verification for every agent that runs it.

## Specs

None directly. The generator's rule (a template inside a comment "names no real
identifier and the generator skips it") is stated in `docs/product/directives.md`
itself; the proof exists to hold that rule shut and currently cannot.

## Relevant files

- `apps/desktop/scripts/directive-proof.mjs` — the check and its fixture; either the
  check's expectation or the generator's comment-skipping has drifted.
- `tools/symbol-artifact/generate.mjs` — the parser whose comment handling the check
  asserts.
- `docs/product/directives.md` — the trailing HTML-comment template the check reads.
