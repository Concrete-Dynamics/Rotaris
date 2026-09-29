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
