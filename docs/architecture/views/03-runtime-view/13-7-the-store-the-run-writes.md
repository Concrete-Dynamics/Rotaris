# Runtime view — a run from prompt to terminal result, and everything that reaches into it — 7. The store the run writes (`packages/store/src/schema.ts`, v35)

Part 13 of 16 of [the runtime view](../03-runtime-view.md), which indexes every part.

## 7. The store the run writes (`packages/store/src/schema.ts`, v35)

**The whole-store restore around it (ADR-0058, REQ-SESSION-201).** The workspace service runs `restoreStore` with the run
host's connection closed: the artifact staged as `<identifier>.restoring-<n>` (step 6), the store displaced (step 8), the
staging copy installed (step 9), and on a failed install the R1/R2 reversal. Every failure that returns with the store as it
was deletes the staging copy before it returns (OQ-265, `discardStaging`), a failed step-9a write of `origin.txt` among them
(fin44); a delete that fails is listed in the report's
`leftovers`, named in its error and logged; a reversal that failed keeps and lists the copy beside the displaced store.
Before step 8 it writes the journal `<identifier>.restore-pending`, removed once step 9 or the reversal succeeds (OQ-266).

**The store open (the workspace service's `openOwn` → `openWorkspaceStore`).** Before anything is created, in order: a
restore cut between its renames is reversed from its journal (`recoverCutRestore` puts back the displaced store, applies
nothing from the backup, and `workspace.opened` carries `cutRestore`, which main raises once as an info notice); then a
place that exists and holds no `workspace.db` is refused as `workspace.store-missing` and nothing is put there
(REQ-SESSION-202, W-31), so the run host is never handed a store and `session.list` answers that refusal; only an absent
place gets a store created (REQ-SESSION-043) — since 2026-10-14 (OQ-281) made whole in the dot-prefixed sibling
`.<32 hex>` (the identifier's random part, two characters shorter than the place so its database never crosses D11's limit
first; `.<identifier>.new` until 2026-10-15, which the next open still removes) (created, migrated, closed, `origin.txt` written), renamed into `<identifier>` with a bounded retry on
`EPERM`/`EBUSY`, and then opened `mustExist` like any present store; a place that appeared meanwhile discards the sibling and is
opened (or refused) as found, a failed create removes it, and a stray one is removed at the identifier's next open, however the place is found.
Every scan of the workspaces root skips dot-prefixed entries. While the service's own restore is in flight its opens skip the
first check and refuse rather than create beside the journal. In a window holding such a refusal, every command's
`workspace.none` answer (and the checkpoints' `checkpoint.no-workspace`) leaves `runCommand` as the held refusal (`answerUnderHeldRefusal`), and `session.start` says nothing was
started because the store could not be opened (REQ-SESSION-089).

**Resolving a place that holds no store (OQ-281, ruled 2026-10-14 under R-072).** Main holds the refusal per canonical root
(`storeRefusals`, with the id of the error notice it raised, whose action opens Settings at Project). Settings › Project ›
Session store resolves it in one of two deliberate ways, both conducted by `main/store-resolution.ts`: the **restore**, admitted
for a window with no workspace identifier while `store-missing` is held (its `runs.active` gate skipped, since no store was
handed to the run host; the restore's own refusal of new runs and both liveness evaluations still run inside the swap, and step 8
displaces the empty place like any target, so it is kept); or **"Start a new session store…"**, offered only while the condition
is held, which asks with Cancel the default (`establishBox`), and on confirmation has the service re-check the condition (place
present, no `workspace.db`, no restore journal), move the place aside under the assessed stamp and create the store as an absent
place's open does (`establishInEmptyPlace`, `packages/store/src/establish.ts`). Either is followed by the window's open
(`MainWindows.open`), which hands the run host the store, clears the held refusal and withdraws its notice.
