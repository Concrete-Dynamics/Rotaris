## `write_file`'s first-use refusal recurred: two children regenerated their whole file

Two children's first `write_file` call omitted `operation` and was refused "write_file requires an operation…"; each
then regenerated its whole file in a second call. The refusal names the field and gives an example, as the earlier
repair made it do, but the tool's description never names the `operation` field. The JSON schema the model is sent does
name it (a required enum, `files.ts:321`), so the model was not without the field; the prose it reads first says
"Create, edit … overwrite, insert into, or undo" without saying these are the values of a required `operation`, and both
children's first calls went without it.

Live-run finding: WF1 (live runs of 2026-09-29)

It recurred from [`a-first-use-schema-guess-failed-without-an-example.md`](fixed/a-first-use-schema-guess-failed-without-an-example.md),
whose repair gave the refusal an example.

## Specs

- `REQ-TOOLS-032` (the recoverable refusal) is met; `REQ-TOOLS-135` names `operation` as the selector. No requirement
  fixes the description's wording, so the repair is the description's, within what those requirements allow.

## Evidence

- Pack `.live-run/runs/2026-09-29T03-06-14-929Z/` (the sweep worktree; git-ignored), session `379f1490`: tool call #79 (child `b`, `test/extra.test.js`) and #81 (child `a`, `docs/api.md`), each
  `write_file` with `path` and `content` and no `operation`, refused; `b` wrote at #82. Regenerating cost `b` 31.8 s and
  `a` 40.9 s.

## Relevant files

- `packages/agent-tools/src/tools/files.ts:333` — `write_file`'s description, which never names `operation`.
- `packages/agent-tools/src/tools/files.ts:344-345` — the refusal.

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
REQ-TOOLS-032's three, so it is raised as [OQ-139](../architecture/open-questions.md) and not built. The note stays open
until that is ruled.
