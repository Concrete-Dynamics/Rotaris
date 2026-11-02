## The hooks payload bound test times a module import together with the payload it bounds

`packages/hooks/src/engine.test.ts`, "REQ-HOOKS-139: resolving/gating 100 entries and building a 100 KB payload stay
inside their bounds", starts its 10 ms clock (`s2`) **before** `await import('./payload.js')` and stops it after
`serializePayload(buildToolPayload(…))`, so the dynamic import's resolution and module evaluation are charged to the
payload's 10 ms budget. On a loaded host the import alone can take the margin: on 2026-09-28 a full `pnpm check` run as
root under Node 24 on a 4-CPU container, with other agents' work on the same host, failed it at `expected 10.300076 to be
less than 10`; the same file run alone three times straight afterwards passed 23 of 23 each time. A gate that goes red
on host load for a cost the requirement excludes is noise that teaches people to re-run rather than read.

Found 2026-09-28 while gating the `fix-ui-contract-and-hygiene` branch (R-062). Recorded, not repaired — outside the item.
The repair's shape: import `payload.js` statically (or before `s2`) so the window holds only `buildToolPayload` and
`serializePayload`, which is what the requirement bounds.

## Specs

REQ-HOOKS-139 bounds building one payload at 10 ms "timing the named operation alone and excluding application start-up";
the test times a module load beside it, so it measures something the requirement excludes and can fail without the
product breaching the bound.

## Relevant files

- `packages/hooks/src/engine.test.ts` — the `s2` window that encloses `await import('./payload.js')`.
- `packages/hooks/src/payload.ts` — `buildToolPayload` and `serializePayload`, the operation the bound names.

## Repaired 2026-09-29 under R-067

Repaired 2026-09-29 under [R-067](../../product/requests.md#r-067). `engine.test.ts` imports `buildToolPayload` and
`serializePayload` statically with the file, so the `s2` window now holds only the build and the serialisation that
REQ-HOOKS-139's 10 ms bound names. The bound, the payload size and the assertion are unchanged.

**What confirmed it first.** A probe run in vitest measured `await import('./payload.js')` inside the same window:
- 720.9 ms where the module was not yet loaded;
- 0.02 to 0.06 ms where it was loaded, as it is in `engine.test.ts` through `engine.js`.

Even the cached import was a trip through vitest's module runner, charged to the budget. The payload operation itself
measured 1.3 to 2.5 ms. The probe was a scratch file and was not kept.

**Pinned by** the case itself, "REQ-HOOKS-139: resolving/gating 100 entries and building a 100 KB payload stay inside
their bounds". Its window no longer contains an import. It passed three runs of the file alone
(`pnpm vitest run packages/hooks/src/engine.test.ts`, 23 of 23 each) and the full `pnpm check` under Node 24 as root.
The original red came from host load, so no run can show it red on demand; this repair removes a cost the requirement
excludes, and does not claim a flake rate.
