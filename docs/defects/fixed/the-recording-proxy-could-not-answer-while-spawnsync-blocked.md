## the recording proxy could not answer a single call, because `spawnSync` blocked the loop it listened on

The live run's model-traffic recorder (`apps/desktop/scripts/lib/model-traffic.mjs`, merged 2026-09-22 in
`2449518`) is an in-process `http` listener: the sandbox's `base_url` points at it and it forwards to the real
endpoint. The live run launched every scenario with **`spawnSync`**, which blocks the Node event loop until the
child exits. A listener on a blocked loop accepts nothing. The connection sits in the kernel's listen backlog
and is served only after the scenario is over — by which time the app that made it is gone.

So the mechanism was inert in exactly the situation it was written for. It passed its unit tests (which run on
an unblocked loop) and would have hung every model call of every live run, which is worse than recording
nothing: the sandbox would have waited on the proxy until the app's own model timeout fired.

Measured, not reasoned. A probe put a counting server on a port and a child that `fetch`ed it while the parent
sat in `spawnSync`:

```
CHILD: NO ANSWER after 6012 ms — TimeoutError: The operation was aborted due to timeout
requests the server actually served DURING the block: 0
```

Zero. Not slow — none.

The defect is of the same family as the one `codebase.md` records for 2026-09-12: a proof that cannot fail is a
finding. Here the proxy's nine tests all passed while the thing they described could not run at all, because
every one of them exercised it from a loop that was free.

## Specs

None. This is harness code; nothing in `docs/spec/` governs `apps/desktop/scripts/`. It is recorded because
`AGENTS.md` claims the live run records what the model was sent and what came back, and for the window between
`2449518` and this repair that claim was false in a way no check would have caught.

## Relevant files

- `apps/desktop/scripts/live-run.mjs` — `runElectron`, previously a `spawnSync` call and now a `spawn` wrapped
  in a promise with its own kill timer; `launch` became `async`, and its six call sites `await` it.
- `apps/desktop/scripts/lib/model-traffic.mjs` — the listener that could not answer.
- `apps/desktop/scripts/lib/model-traffic.test.ts` — the suite that was green throughout.

## Repaired — 2026-09-22

`runElectron` now spawns asynchronously and resolves on `close`, collecting `stdout`/`stderr` through `setEncoding`
handlers and keeping the SIGKILL-on-timeout behaviour the synchronous form had (a `timedOut` flag reports
`status: null, signal: 'SIGKILL'` so every existing caller reads a timeout the same way it did before). The
event loop stays free for the whole of a launch, which is what the proxy needs and also what the fault rules
added the same day need.

Guarded by a test that **asserts both legs**, in `model-traffic.test.ts`: a request made from a `spawnSync`
child is not served while the parent blocks, and the same request made from an async `spawn` child is. The
first leg is the counterfactual — without it the second could pass for a reason unrelated to the repair, and
the regression this note exists to prevent would return unnoticed.
