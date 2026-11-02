## The coverage report credits a quantity in capitals as an identifier on Node 24.11

Seen on Windows 11 x64 (build 26200), Node 24.11.0 (V8 13.6.233.10), at `c9ebc8cf`, in `pnpm check` and alone:
`tools/requirement-coverage/coverage.test.ts`'s "reads a tight continuation … and units in any case" read
`REQ-DEMO-001, 200 MS later` as `REQ-DEMO-001` and `REQ-DEMO-200`.

`QUANTITY` scoped its unit list with the `i` modifier, `(?i:(?:ms|s|sec|…|min|…)\b)`. That V8 loses the scoped `i` from
alternatives sharing a prefix: `/^(?i:ms|min)/.test('MS')` is `false` while `/^(?i:min|ms)/.test('MS')` and
`/^(?i:ms)/.test('MS')` are `true`. So `MS`, `SEC`, `MIN`, `PX`, `KB`, `LINES`, `CALLS`, `FILES`, `DAYS` and `HOURS` read as
no unit and their number as a continuation, while `Ms`, `S`, `Bytes` and `Tokens` read as units. The other uses of a
scoped modifier in the tree (`search.ts`, `tools.test.ts`) pass a single word and are not affected.

## Specs

None contradicted: a defect of the coverage tool, which credits requirements a text does not cite.

## Relevant files

- `tools/requirement-coverage/coverage.mjs` — `QUANTITY`, the unit list.
- `tools/requirement-coverage/coverage.test.ts` — the case that met it.

## Repaired — 2026-10-20

The unit list is spelled without the modifier: each letter of each unit is its own two-case class (`anyCase`), and
`[kmg]b` became `(?:k|m|g)b` so the spelling touches letters only. The case passes on Node 24.11.0.
