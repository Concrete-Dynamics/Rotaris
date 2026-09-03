# IC-4 — the machine identifier under a real rename, and the foreign-lock report as one condition

- **Date:** 2026-09-03 (half 1 discharged; half 2 prepared and awaiting the owner)
- **Taken as:** the first act of building the restore behind a real run host (ADR-0058, ADR-0002 c.7).
- **Binds:** the first implementation of `REQ-SESSION-046`'s machine identifier and of `REQ-SESSION-201`'s
  foreign-lock report (`implementation-conditions.md`, IC-4).

## Half 1 — the foreign-lock report: discharged

**What must be shown:** with a genuinely foreign row present, the restore reports the whole set as one
condition, the confirmation states the risk rather than only the condition, and proceeding does not
require clearing rows one at a time.

**Shown, three ways:**

| Where | What held |
|---|---|
| `packages/store/src/store.test.ts` D9 | two rows naming another machine → one refusal `foreign-locks` naming both; `risk` states that a run on the other machine may be writing now; `proceedWithForeignLocks` proceeds; the foreign row inside the artifact is dropped on the way in (ADR-0005 c.11) |
| `packages/workspace/src/workspace.test.ts` D9 / IC-4 | the assessment lists the foreign rows together and separately from live rows; the perform refuses until confirmed and then proceeds with no per-row action |
| `apps/desktop/src/main/index.ts` | the third message box: *"N sessions in the store carry lock records naming another machine: …"* with the detail *"If this store genuinely is reachable from another machine, a run there may be writing to it now, and the restore replaces what it writes. Nothing needs to be cleared one at a time."* Cancel is the default |

No path names sessions individually as things to clear; no confirmation states the condition without the
risk.

## Half 2 — the rename: prepared, not yet run

**What must be shown:** rename the machine — actually rename it — with lock rows present naming `host`,
and confirm that `host` is unchanged, that no row becomes foreign, and that a restore proceeds without
any release action by the user.

**The harness:** `packages/platform/src/machine-id-rename.spike.test.ts`, two phases around a rename and
reboot the owner performs:

```
ROTARIS_IC4_PHASE=prepare pnpm vitest run packages/platform/src/machine-id-rename.spike.test.ts
# rename the Windows computer (Settings → System → About → Rename this PC), reboot
ROTARIS_IC4_PHASE=verify  pnpm vitest run packages/platform/src/machine-id-rename.spike.test.ts
```

`prepare` records `host` (the product's identifier from `<LocalAppData>/rotaris/data/machine-id`) and the
operating-system hostname and writes twenty lock records naming `host`. `verify` asserts `host` is
byte-identical, the hostname differs, not one row is foreign under `isLockForeign`, and none is live. It
is skipped without the phase variable, so `pnpm check` is unaffected.

**What would count as failing it:** `host` moving for any reason a rename can cause; a row reading as
foreign afterwards.

**Why it is not run here:** it changes the state of the owner's machine and needs a reboot. IC-4 stays
**open on this half** until the figures are pasted below.

### Result

*(to be recorded by the owner's run)*

## What it does not cover

Whether two machines can reach one store at all — ESC-21's second premise, owed separately.
