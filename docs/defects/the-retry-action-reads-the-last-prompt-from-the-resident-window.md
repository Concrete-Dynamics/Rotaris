## The retry action reads the last prompt from the resident window

With a blank draft, `retryRun` (`apps/desktop/src/renderer/session-actions.ts`) takes the last submitted prompt to be the
newest `user` row among the replica's rows. Those are the resident window, which keeps at most `RESIDENT_ROW_CAP` rows
(`@rotaris/store`; the engine releases older rows, `session-writer.ts`, and the projection drops them,
`projection-owner.ts`). If more rows than that follow the prompt before the failure (a long run's tool and agent rows),
the prompt is no longer resident. The retry then refuses with "There is no draft and no submitted prompt in this session
to retry.", which is untrue: the session has one, and the engine's own continue reads it from the store. Noticed by the
verifier of `fin5-noticed-gaps` (repair round 1, optional finding) and recorded there. Not repaired: the repair is to
ask the engine for the session's last prompt, which needs a command the renderer does not have. It is the same way back
as [the-retry-action-resubmits-a-prompt-without-its-images.md](the-retry-action-resubmits-a-prompt-without-its-images.md)
needs, so both are best repaired together.

## Specs

- REQ-NOTIFY-045: the retry resubmits "the last submitted prompt" where the draft is empty; a refusal claiming there is
  none, when there is one, is a false statement to the user.

## Relevant files

- `apps/desktop/src/renderer/session-actions.ts`: `retryRun`'s search of `state.rows`.
- `packages/engine/src/session-writer.ts`, `packages/engine/src/projection-owner.ts`: the window and `RESIDENT_ROW_CAP`.
- `packages/engine/src/sessions.ts`: the continue path, which reads the session's prompt from the store.
