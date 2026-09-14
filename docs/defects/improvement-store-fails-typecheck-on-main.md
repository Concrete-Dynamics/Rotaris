## The improvement store lands `main` with the verification gate red

`pnpm check` fails on a clean checkout of `main` (verified on `6e7fb6f`, 2026-09-14, then again
with the working tree stashed): the improvement store's commit (`927cacb`, 2026-09-14) shipped a
broken **typecheck** leg and stale **tests**. Two findings, one cause — the store work was
verified through its focused suites and never through the whole gate.

**Leg 1 — typecheck.** `packages/workspace/src/improvements/handles.ts:455`:

```
handles.ts(455,7): error TS2379: Argument of type '{ expectedVersionsDue: number | undefined; }'
is not assignable to parameter of type 'CommitOptions' with 'exactOptionalPropertyTypes: true'.
```

`mutate` forwards its `expectedVersionsDue: number | undefined` parameter straight into the
options object it passes to `commit`. Under `exactOptionalPropertyTypes` an explicit `undefined`
is not assignable to the optional `CommitOptions.expectedVersionsDue`, so the literal fails even
when the caller supplied no value at all.

**Leg 2 — the store suite.** `packages/store/src/schema.ts` gained migration v18
(`run_type`/`improvement_artifact_ids` on `sessions`, the two improvement tables) but
`packages/store/src/store.test.ts` still pinned the world at v17: four assertions failed —
`CURRENT_SCHEMA_VERSION` expected 17, the migration-ladder pin listed `[1..17]`, and the two
migrate-forward tests (v15→current, v16→current) tore down only v17's objects, so the replay
tripped over the still-present v18 columns (`duplicate column name: run_type`). The ladder pins
exist precisely so a later part fails there and not on a user's disk — the failure working is
not the problem; the commit shipping without seeing it is.

Noticed while verifying an unrelated toolchain repair on 2026-09-14; both legs predate this
session (they ship with the improvement store, commit `927cacb`) and block a green `pnpm check`
for every agent.

## Specs

None — this contradicts the repository's own verification gate (`pnpm check`'s typecheck leg),
not a behavioural requirement.

## Repaired — 2026-09-14, in place

- **Typecheck:** the options literal includes the key only when the caller supplied a value —
  `expectedVersionsDue === undefined ? {} : { expectedVersionsDue }` — with a comment naming the
  compiler option that demands it.
- **Store tests:** the ladder pin and the version pin read 18 with the v18 addition named beside
  the others; both migrate-forward tests drop v18's objects (improvement tables whole, session
  columns last) before rewinding, and the v16 test asserts the climb runs to
  `CURRENT_SCHEMA_VERSION` rather than to a lone 17 — the ladder is append-only, so a v16 store
  climbs every appended rung, and pinning the *ladder* rather than a single hop is what keeps
  the next append from breaking the same assertion again.

Verification: `rtk vitest packages/store/src/store.test.ts` 42/42; improvement-store suites
10/10; `tsc -p tsconfig.json --noEmit` clean.
