## A paused run's notice says a person stopped it

Every run that ends with stop reason `user_cancelled` gets the same end-of-run summary: "The run came to rest because a
person stopped it." That covers a pause, a stop, a quit and the explicit cancel alike. After a pause the banner above
the paused session says the run was stopped, while the transcript's own row says "Run paused at the user's request".
Since PD-ORCH-005, what the user can do next depends on which rest it was. After a pause, a stop or a quit, the agents
resume on a continue; after the explicit cancel, none do. The notice tells the user neither.

Noticed 2026-09-27 in PD-ORCH-005's phase 7 built-app evidence, after the pause with an approval pending. The wording
dates from 2026-09-20, before the directive.

## Specs

`REQ-ORCH-082` fixes the summary's arms and leaves the wording to the implementation; nothing contradicts it outright.
`REQ-MONITOR-125` asks for a paused session to persist "with an interruption message". The message shown names the
wrong interruption.

## Relevant files

- `packages/engine/src/run/stop-conditions.ts` — `summarise`, the `user_cancelled` arm.
- `packages/engine/src/run/run.ts` — `restCause`, which knows which rest it was.
