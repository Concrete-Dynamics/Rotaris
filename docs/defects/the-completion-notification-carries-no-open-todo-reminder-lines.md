## The completion notification carries no open-todo reminder lines

REQ-ORCH-059's completion notification for a background child is built by `completionNotification`: the banner, the task
id, the description, the duration, the state, and either the remaining count with its instructions or the statement that
all background tasks have completed. The requirement's sentence "Open-todo reminder lines are appended." is not built: no
line names the parent's open plan items, so a coordinator that is told a child finished is never reminded what its own plan
still holds open. Found while ruling live-run finding K2 (both advocates and the ruling of
[OQ-213](../architecture/open-questions.md), 2026-10-07, name it); it needs no ruling of its own.

## Specs

- `REQ-ORCH-059`: "For each background child that completed, a completion notification MUST be injected into the parent
  conversation … Open-todo reminder lines are appended."
- `REQ-TOOLS-144` / `REQ-ORCH-075`: the agent's own todo list and its open items (`PENDING`, `IN_PROGRESS`).

## Relevant files

- `packages/engine/src/children/notify.ts` — `completionNotification`.
- `packages/engine/src/children/orchestration.ts` — `runWithChildren`, the one caller, which builds the message the parent
  is resumed with.
- `packages/engine/src/run/run.ts` — `openRootPlan`, `agentTodoFor`: where the parent's open items can be read.
