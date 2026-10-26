## `write_file`'s first-use refusal recurred: two children regenerated their whole file

Two children's first `write_file` call omitted `operation` and was refused "write_file requires an operation…"; each
then regenerated its whole file in a second call. The refusal names the field and gives an example, as the earlier
repair made it do, but the tool's description never names the `operation` field. The JSON schema the model is sent does
name it (a required enum, `files.ts:321`), so the model was not without the field; the prose it reads first says
"Create, edit … overwrite, insert into, or undo" without saying these are the values of a required `operation`, and both
children's first calls went without it.

Live-run finding: WF1 (live runs of 2026-09-29)

It recurred from [`a-first-use-schema-guess-failed-without-an-example.md`](a-first-use-schema-guess-failed-without-an-example.md),
whose repair gave the refusal an example.

## Specs

- `REQ-TOOLS-032` (the recoverable refusal) is met; `REQ-TOOLS-135` names `operation` as the selector. No requirement
  fixes the description's wording, so the repair is the description's, within what those requirements allow.

## Evidence

- Pack `.live-run/runs/2026-09-29T03-06-14-929Z/` (the sweep worktree; git-ignored), session `379f1490`: tool call #79 (child `b`, `test/extra.test.js`) and #81 (child `a`, `docs/api.md`), each
  `write_file` with `path` and `content` and no `operation`, refused; `b` wrote at #82. Regenerating cost `b` 31.8 s and
  `a` 40.9 s.

## Relevant files

- `packages/agent-tools/src/tools/files.ts:345` — `write_file`'s description, which names `operation` since the partial
  repair below. *(Updated 2026-10-01: this line first read "`files.ts:333` — `write_file`'s description, which never
  names `operation`", true when the note was written.)*
- `packages/agent-tools/src/tools/files.ts:355-356` — the refusal (first cited at `:344-345`).
- `packages/agent-tools/src/tools/files.ts:323` — the schema's required `operation` enum (cited above at `:321`).

## Partly repaired — 2026-09-29 under R-067; still open

`write_file`'s description now names the field before anything else a model reads: "Every call names its `operation` —
one of create, edit, overwrite, insert, undo — with the fields that operation reads", then each operation's fields and a
`create` example (`packages/agent-tools/src/tools/files.ts`). The test "REQ-TOOLS-135: write_file's description names
its required `operation` field, each value, and the fields each reads" in `tools.test.ts` pins it, and fails on the old
description.

That was not enough. `pnpm live-run --confirm --only=frictions` (pack `.live-run/runs/2026-09-30T03-31-53-798Z` of the
`fix-file-tools-plurals` worktree) passed "write_file needed no operation repair on first use", but the first live run's
frictions had passed it too, so frictions does not tell the two apart. `--only=duress` (pack
`.live-run/runs/2026-09-30T03-33-01-241Z`) is where the defect was seen. That run was swept by a concurrent live run
before it could print a check
([`a-live-run-sweeps-a-concurrent-live-runs-sandbox.md`](a-live-run-sweeps-a-concurrent-live-runs-sandbox.md)). Its
`model-traffic.jsonl` held every call, though. 179 requests carried the new description. There were five `write_file`
calls from four children, and three first uses succeeded (`docs/api.md`, `docs/overview.md`, `docs/decisions.md`).
Child `b`'s first call, for `test/extra.test.js`, again sent only `path` and `content`. It was refused, and `b` resent
the whole 224-line file with `operation: "create"`. That is 1 of 4 first uses refused, against 2 of 4 in the run that
found this. The schema the child was sent marked `operation` required.

Only reading the missing selector from the call can make a first use succeed. That is a fourth repair beyond
REQ-TOOLS-032's three, so it is raised as [OQ-139](../../architecture/open-questions.md) and not built. The note stays open
until that is ruled.

## Seen again 2026-10-01, on merged `main` `71ad8e8`; still open

The duress run on merged `main` `71ad8e8` hit this again. That run used `LIVE_RUN_DURESS_MS=5400000`, pack
`.live-run/runs/2026-10-01T03-15-27-194Z/` of the `accept` worktree (git-ignored), session `57095770`. It carried the
description that names `operation`.

Five children each made a first `write_file` call, and 2 of the 5 were refused. On 2026-09-30 it was 1 of 4. Before
the description named the field, it was 2 of 4.

- **#126**, child `design-decisions`, `docs/decisions.md`, 03:23:41.766. The call sent `path` and `content` and no
  `operation`, and was refused `invalid_request` "write_file requires an operation: one of create, edit, overwrite,
  insert, undo. Example: …". The request that emitted it (traffic #73) ran 97.4 s. The child's next request (traffic
  #75) ran 70.7 s and produced 6,398 output tokens, regenerating the file. #129 then created it with `operation: "create"`, 244 lines.
- **#244**, child `verify-result`, `docs/verification.md`, 04:03:17.261. The same refusal. The next request (traffic
  #185) ran 6.8 s and produced 586 output tokens. #246 then created the file with `operation: "create"`, 46 lines.
- The three first uses that succeeded were #59 (`repo-overview`), #61 (`extra-tests`) and #62 (`api-docs`).

Together the two refusals cost about 77.5 s and about 7.0k regenerated output tokens. The store's `tool_calls` and the
pack's `model-traffic.jsonl` give these figures. The first was read from a copy of the store; the pack was never
written.

This adds evidence and changes no code. The reading the build proceeds under is still OQ-139's: no inference, and the
call is refused as REQ-TOOLS-032 says. Only reading the missing selector from the call could make a first use succeed,
and that waits on OQ-139's ruling, which is the owner's. Since `1303184` (merged at `33316bb`, after this run), such a
refusal also files a `tool_error` issue
([`fixed/a-call-refused-at-the-tool-gates-schema-check-files-no-tool-error-issue.md`](a-call-refused-at-the-tool-gates-schema-check-files-no-tool-error-issue.md)).
The model still regenerates its file all the same.

## Seen again 2026-10-06, on `main` `27a5127`, at its highest rate; still open

The orchestrator's final duress live run at `27a5127` against the self-hosted endpoint (pack
`.live-run/runs/2026-10-06T01-47-53-900Z/` of the live worktree, git-ignored; `--only=duress`, `live-run PASSED` with 19
PASS, 0 FAIL, 5 NOTE), finding H6 of its autopsy. Six agents made a first `write_file` call and **4 of the 6 were
refused**, each sending `path` and `content` with no `operation`:

- **#81** `wave1a api reference`, **#82** `wave1b branch tests`, **#176** `wave2e design decisions` and **#278**
  `wave3 verify result` (`workspace.db`, `tool_calls`); the same child's second attempt, #283, was refused too. Its third,
  #284, did name `operation: "create"` and was refused for another reason: its path, `/tmp/rotaris-check-cites.py`, lies
  outside the workspace ("Path '…' is outside workspace root '…'"), not for `operation` (read from the pack's
  `tool_calls` on 2026-10-06, fin21). Each `operation` refusal filed a `tool_error` issue, as the schema gate's repair made
  it do.
- The two first uses that succeeded were #83 (`wave1c repo overview`) and #324 (the continuation).
- **Regenerating cost 179.4 s and 16,966 output tokens** (`duress/model-traffic.jsonl`, 0-based): #39 33.2 s and 3,039
  tokens; #41 33.4 s and 2,852; #100 97.0 s and 9,777; #185 6.4 s and 416; #190 9.4 s and 882. Only the failed child's
  15.8 s lay on the run's critical path.

The rate was 2 of 5 at `71ad8e8` and at `1763f7f`, and 1 of 4 on 2026-09-30. Recorded as evidence only; no code changes.
The reading the build proceeds under is still OQ-139's, "May a `write_file` call with no `operation` be read as the one
operation its other arguments allow?" — no inference, the call refused as REQ-TOOLS-032 says — and the ruling is the
owner's.

## Repaired — 2026-10-06, under the owner's ruling of OQ-139 (fin21)

The owner ruled [OQ-139](../../architecture/open-questions.md) on 2026-10-06 as recommended
([R-071](../../product/requests.md#r-071)), minted as [`PD-TOOLS-007`](../../product/directives/pd-tools-007.md#pd-tools-007), which
extends REQ-TOOLS-032 with this one repair. A `write_file` call with a path and content, no `operation` and no field only
another operation reads is read as a `create` when its file does not exist, and its result says so: `No operation was
given, so this call was read as 'create': <path> did not exist. Name the operation on every write_file call.` A call
naming an existing file is refused as before, and the refusal now says the file exists. The tool offers the repair to the
gate (`inferArguments`, `packages/agent-tools/src/tools/files.ts`); the gate asks for it only for a call its schema still
refuses after REQ-TOOLS-032's three, validates what comes back, and carries the sentence into the result
(`packages/agent-tools/src/gate.ts`). The record, the row's label and any approval read the `create`.

Pinned by the four `PD-TOOLS-007` cases in `packages/agent-tools/src/gate.test.ts`, three of them red on the code before
the repair. A live run has not yet met the shape: `pnpm live-run`'s `frictions` and `duress` scenarios now check that no
create-shaped call was refused for want of an operation (`apps/desktop/scripts/lib/tool-frictions.mjs`), and their next
run is the first to show it on a real model. *fin23, 2026-10-06:* since `760394c` that check runs no longer in those two
scenarios but once, at the run's end, over every session the run keeps (`checkToolRecord` in
`apps/desktop/scripts/live-run.mjs`, over `runWideReadings`), reading arguments the record stores cut; the default run at
`c2a9444` met the shape in two sessions the two scenarios' check never read, the resume session's ordinal 9 read as a
create and the requirements session's ordinal 62 refused at the fence
(`docs/defects/fixed/the-live-runs-tool-friction-checks-read-two-scenarios-and-miss-a-refused-call-whose-arguments-were-cut.md`).
