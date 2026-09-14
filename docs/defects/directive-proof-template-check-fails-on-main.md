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

## Repaired — 2026-09-14

The generator's comment handling was never wrong — the check's expectation was. It asserted that
`'PD-CHAT-001'` appeared nowhere in the generated artifact, which held only while the sole
PD-CHAT-001 in existence was the example inside the register's comment; from the day the owner
minted a real PD-CHAT-001 (the composer's press-revealed popover chips, R-010), the assertion was
unsatisfiable by construction and nothing about the generator could satisfy it.

What the comment promises is that its content is **skipped**, and that is checkable exactly: the
parse of the register with its comments removed must be byte-identical to the parse of the register
as committed. The check now does precisely that — it strips `<!-- … -->` from the committed
register, re-runs the generator against the stripped text, and asserts the artifact is unchanged
byte for byte. This is strictly stronger than the old assertion: it holds for every comment,
whatever identifiers it contains, and it would catch a generator that started parsing comments
(no artifact change) *or* one that started dropping real directives when comments were present.

A companion assertion verifies the fixture is live — that the committed register really does carry
an HTML comment — so the check cannot go green by silently stripping nothing.

Verification: `pnpm directive-proof` passes 26/26 on a clean `main` where it passed 24/25 before;
the register is restored and the artifact regenerated in the `finally` block as before.
