# Spike — a QuickJS isolate for agent-written workflow scripts

- **Date:** 2026-11-24
- **Taken as:** the first act of building the workflow tool of
  [`PD-ORCH-018`](../../product/directives/pd-orch-018.md#pd-orch-018) clause 5, on [R-126](../../product/requests.md#r-126).
- **Question:** the owner chose a QuickJS isolate compiled to WebAssembly as the runtime for a script an agent writes.
  Does it give a script no ambient authority, carry asynchronous calls to the host and back in an order a journal can
  replay, and stop a script that loops or allocates without end, inside a Node process of the version the run host runs on?

## Method

`quickjs-emscripten` 0.32.0 (public library, its `release-sync` variant), Node 24.18.0 on a developer's Ubuntu host, in a
scratch directory outside the repository: nothing was added to the workspace or its lockfile. Six cases in one script, then
two more scripts for memory alone. Not run inside Electron, and not through electron-vite's bundle: both are owed by the
build that adds the dependency.

## What it found

| Case | Result |
|---|---|
| Host function returning a promise; three calls side by side, then a fourth using their results | **Held.** The host saw the four calls in call order (0, 1, 2, then 3) though it settled the first three in reverse; the script's result was right. The host must call `runtime.executePendingJobs()` after each settlement and once after the evaluation, or the awaiting side deadlocks: the first run of the thrown-error case hung for that reason. |
| Ambient authority | **Held.** `require`, `process`, `fetch`, `setTimeout` and `console` are undefined, `Function('return typeof process')()` answers `undefined`, and the global object has 61 own names. `Date` and `Math.random` exist; deleting `Date` and unsetting `Math.random` from the host before the script runs removes both. |
| `for(;;){}` under an interrupt handler with a 200 ms deadline | **Held.** Ended at 201 ms with `InternalError: interrupted`. |
| A script that allocates without end, `setMemoryLimit(32 MiB)` | **Falsified.** The script ended with `out of memory` only when the WebAssembly heap was exhausted: the process stood at 1.5 to 2.1 GiB resident, the same at a limit of 8, 32 and 128 MiB and whether set by `setMemoryLimit` or by the runtime's `memoryLimitBytes` option, and the memory was not returned when the runtime was disposed. |
| The same scripts in a module instantiated over `new WebAssembly.Memory({ initial: 256, maximum: 1024 })` (64 MiB) | **Held.** `out of memory` after 53 arrays of 100,000 numbers, 61 strings of a megabyte, or 311,073 small objects; the process stood at 106 to 125 MiB. |
| A syntax error, and an error thrown inside an async function | **Held.** Both reach the host as a name, a message and a stack naming the file and the line (`workflow.js:1:11`). |
| Cost | Loading the module took 7.9 ms; a fresh runtime and context, 0.18 ms. |

## What it decides

- **The memory bound is the WebAssembly memory's `maximum`, never `setMemoryLimit`.** Each workflow gets its own module
  instance over its own capped memory, so one script's heap is bounded and is released with the instance.
- **The host pumps pending jobs** after every settlement it makes and after the evaluation.
- **`Date` and `Math.random` are removed before the script runs,** which is what makes a replay from a journal read the
  same script the same way (clause 8).
- **A script's time on the processor is bounded by the interrupt handler**; its time waiting on its agents is not time on
  the processor and is bounded by the run's own limits.

## Not measured

The module inside Electron's run-host process and inside the packaged application's archive (a `.wasm` file the bundler
must carry); Windows and macOS; a script holding many pending calls at once; the asyncify variant, which was not needed.
