## The create-guard tells an agent it read a file its sibling wrote

The `write_file` `create` refusal was extended on 2026-09-22 (`9896425`) to say whose file it is. It
decides that from `FileToolState.wasRead`, and that record is not the calling agent's. One
`FileToolState` serves every agent and every run on a workspace root (`packages/agent-tools/src/tools/files.ts:37-62`,
held per root in `apps/desktop/src/run-host/host.ts`), and every successful write marks its path read
(`commit`, `files.ts:369-373`). So when a sibling child creates a file and a second child then tries to
create the same path, which is the collision the extension was written for, the second child is told
`You have read it in this session, so it is a file you already know about.` That is false, and it points
the agent to the wrong next step.

The message also no longer carries the exact text `REQ-TOOLS-135` fixes.

## Specs

- `REQ-TOOLS-135`: the `create` refusal is `File already exists: <p>. Use 'overwrite' or 'edit'.` The code
  emits `File already exists: <p> (<n> line(s)). <whose> Read it before deciding, then use 'overwrite' or 'edit'.`
- `REQ-TOOLS-133` and `REQ-TOOLS-137` make the read record shared by every run in the workspace, so the
  record cannot answer "did this agent read it". The message asserts that it can.

## Relevant files

- `packages/agent-tools/src/tools/files.ts`: the `create` branch and `FileToolState`.
- `packages/agent-tools/src/tools/tools.test.ts`: covers only the not-read branch of the message.
- `docs/defects/two-writing-children-in-one-checkout-collided.md`: the note whose improvement introduced this.

Noticed 2026-09-23 while designing sibling write scopes (R-048, item 5).
