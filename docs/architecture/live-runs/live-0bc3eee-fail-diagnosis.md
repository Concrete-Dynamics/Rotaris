# Live run at 0bc3eee: the one FAIL in the terminal scenario

> **In the record since 2026-10-13** (fin41, `fin41-comments-and-evidence`). Written on 2026-10-13 in the orchestrator's
> session scratchpad by a read-only examination of the one FAIL of the default live pack `2026-10-13T12-18-40-282Z` at `0bc3eee`, and copied here unchanged so the record that
> cites it does not depend on the container. Only two things were added: this note, and an HTML comment on each line
> that names a defect note at the path it was proposed under (every such note now sits in `docs/defects/fixed/`).
> Paths under `scratchpad/` and `/home/user/Rotaris-crw-wt-live/.live-run/` name the orchestrator's container: the
> packs are git-ignored and are not carried into the repository. No host, URL, key or token is quoted. The index is
> [`README.md`](README.md).

The run: pack `.live-run/runs/2026-10-13T12-18-40-282Z`, built at `0bc3eee`.
Harness log: `live-0bc3eee-default.log`, line 155:

    FAIL  all 40 lines of output reached the agent  — 0 distinct of 0 marker(s)

Terminal session: `6f11bf67-7e24-457d-b04f-beee048277db` (completed, tasks_complete, 34 tool calls).

## Verdict: (c), a defect in the harness

The product is not at fault, and the model did run the probe's command. The check read a different call
from the one that ran. The model sent the long-output command exactly as written, twice:

- The first send was refused **before it ran** by the REQ-ORCH-029 todo-list gate. The gate refused it
  correctly.
- The second send, after the model wrote its todo list, ran and returned all 40 lines to the model.

`attempted('long-output')[0]` takes the **first** call whose command matches, which is the refused one. Its
result is the gate's refusal text, so it contains no `LINE-` markers.

## Where the check is computed

- `apps/desktop/scripts/live-run.mjs:883-896` `readToolCalls`: reads `tool_calls` rows (`ordinal, tool_name,
  agent_name, status, entry`). Each row exposes `args`, `result`, `isError` and `failureKind`.
- `live-run.mjs:2196`: `attempted = (id) => terminals.filter((call) => shapeOf(id).match.test(String(call.args.command ?? '')))`.
  It matches on the command text only and does not look at `status` or `failureKind`.
- `live-run.mjs:2227`: `const longOutput = attempted('long-output')[0];`
- `live-run.mjs:2230-2231`: `longOutputReading(longOutput.result)` → `check(reading.distinct === LONG_OUTPUT_LINES, ...)`.
- `apps/desktop/scripts/lib/terminal-shapes.mjs:97`: the POSIX shape is `{ id: 'long-output', match: /LINE-/, command: awk ... }`.
  At `:296-301`, `longOutputReading` counts `LINE-(\d{3})` matches in the result.

## Evidence rows (store `workspace.db`, session `6f11bf67…`)

| ordinal | tool | status | failure_kind | command | result |
|---|---|---|---|---|---|
| 1 | terminal | ok | – | here-string `cat <<'EOF' …` | exit 0, alpha-one/beta-two |
| **2** | terminal | **blocked** | **todo_list_owed** | the probe's awk command, byte-identical to the shape | 423 chars: "This call was not run: this task now spans more than one step and you keep no todo list for it (REQ-ORCH-029). …" (0 markers) |
| 3–4 | todo | ok | – | list written (14 tasks), task 1 updated | – |
| **5** | terminal | **ok** | – | the same awk command, identical args | 4,940 chars, exit 0, `outcome_kind success`, **40 markers, 40 distinct, 0 doubled lines, no ESC** |

Corroboration:

- **Model traffic** (`terminal/model-traffic.jsonl`):
  - Request 3 hands the model the 423-character refusal.
  - Request 6 hands it the 4,940-character result with all 40 distinct markers.
  - So the 40 lines reached the model whole.
- **App log** (`terminal/app.filtered.log:40`): "orchestrator began the task's second work item with no todo list of its
  own; the call was refused (REQ-ORCH-029)".
- **Transcript** (`terminal/transcript.md`):
  - Line 115: "I need to create a todo list first."
  - Line 488, the model's report: "exit 0; printed all 40 `LINE-001`…`LINE-040` long lines in full".
- **Harness log, line 151**: the NOTE "long-output×2" counts both calls.
- **Harness log, line 199**: the harness's own coordinator-todo reading notes "terminal #2 (terminal)" as refused by
  the gate. The harness therefore already knows ordinal 2 never ran.
- **Hollow PASSes**: the two checks next to the FAIL, "no two output lines were concatenated" and "the agent read a
  VT-stripped capture" (log lines 156-157), also read ordinal 2. They passed this run without measuring anything.

## Comparison with the passing run at 552d346

In pack `2026-10-13T07-25-27-766Z`, session `8cf99832…`, the model wrote its todo list first (ordinal 1, todo ok).
It then ran the here-string (ordinal 4) and long-output (ordinal 5, ok). That call returned 40 markers, 40 distinct,
0 doubled lines and no ESC.

There was only one long-output call, so `[0]` was the call that ran. The two runs differ in the order the model
chose, not in the product or the harness. `git diff 552d346..0bc3eee` changes neither `terminal-shapes.mjs` nor the
`attempted` selector.

## Why this is not (a) or (b)

- **Not (a), a product defect:**
  - The refusal is REQ-ORCH-029 / OQ-213 working as ruled. The harness's own PASS at log line 195, "no
    coordinator's second work item ran before it wrote a todo list", depends on that refusal.
  - When the command ran, its full output reached the model.
- **Not (b), a different command:**
  - Both calls carry exactly the shape's command.
  - Markers were produced, at ordinal 5.

## Systemic exposure

On both platforms, `long-output` is shape #2 in the prompt (`terminal-shapes.mjs:87-98`). The gate refuses the
coordinator's **second** work item when no list exists. So whenever the model starts without a todo list, the
gate's refusal lands on `long-output`, and this FAIL comes back. It can happen on any run, depending on whether
the model writes its list first.

All twelve `attempted(id)[0]` sites (`live-run.mjs:2212, 2227, 2243, 2260, 2283, 2312, 2334, 2388, 2389, 2405,
2422, 2432`) and the `diagnostics` map (`~2445`) have the same weakness.

## Proposed repair (harness only, nothing in product code)

1. **Add a shared predicate.** Export one predicate in `lib/terminal-shapes.mjs`, or share coordinator-todo's
   `ran`:

       export const reachedShape = (call) => call.failureKind !== 'todo_list_owed' && call.failureKind !== 'invalid_request';

   It must not exclude every `blocked` call. `pipe-to-shell` is measured *by* its permission block (ordinal 33:
   `blocked`, `failure_kind` null). `coordinator-todo.mjs:23`'s `ran` excludes all `blocked` calls, so it cannot be
   reused as it stands.
2. **Filter in `attempted`.** At `live-run.mjs:2196`, add `&& reachedShape(call)` to the filter, so `[0]` is the
   first call that reached execution.
3. **Report gate refusals separately.**
   - Keep counting the refused sends in the "what the model attempted" NOTE, e.g. `long-output×1 (+1 refused at
     the todo gate)`.
   - When every send of a shape was refused, report a NOTE ("long-output was not reached: refused at the todo gate
     (REQ-ORCH-029) and not re-sent"), not a FAIL and not "not attempted".
4. **Pin it in a test.** Add a case to `terminal-shapes.test.ts`: a `todo_list_owed` row followed by an `ok` row of
   the same command selects the `ok` row, and a permission-`blocked` `pipe-to-shell` row stays selectable.

**Proposed defect note:**
`docs/defects/the-live-runs-terminal-shapes-read-a-call-the-todo-gate-refused-before-it-ran.md` <!-- historical-path: docs/defects/the-live-runs-terminal-shapes-read-a-call-the-todo-gate-refused-before-it-ran.md -->

- **Specs:** none in the product. REQ-ORCH-029 is satisfied. The FAIL breaks the harness's own rule that each
  assertion reads what came back from the call the shape issued (`live-run.mjs` ~2142-2166).
- **Relevant files:** `apps/desktop/scripts/live-run.mjs` (2196, 2227-2236 and the other `[0]` sites),
  `apps/desktop/scripts/lib/terminal-shapes.mjs`, `apps/desktop/scripts/lib/terminal-shapes.test.ts`, and
  `apps/desktop/scripts/lib/coordinator-todo.mjs:23` (the `ran` precedent).

Not recorded, because this task is read-only.
