## The retry action resubmits a prompt without its images

REQ-NOTIFY-045's retry "resubmits the current composer draft, or the last submitted prompt where the draft is empty".
`retryRun` (`apps/desktop/src/renderer/session-actions.ts`) resubmits the text alone in both branches: it passes no
attachments to `submitPrompt`. A prompt the user sent with images is therefore retried without them. The draft branch
reads the draft's text only, and the last-prompt branch reads the newest `user` row's body. The engine stores that row
with its `attachments` (`packages/engine/src/sessions.ts`, `appendRow('user', prompt, true, { attachments })`), but the
transcript carries only their metadata (name, media type, size, path, digest; REQ-CHAT-170/173). `session.prompt` takes
the images as bytes (`ImageAttachmentInputSchema`), so the renderer cannot resubmit them without reading them back,
through a command it does not have. Noticed by the verifier of `fin5-noticed-gaps` (repair round 1, optional finding)
and recorded there. Not repaired: carrying the images means a way back to their bytes (an engine-side "resubmit the
last prompt" command, or a read of the session's files), which is more than the retry's wiring. OQ-177 already asks
what the retry is for.

## Specs

- REQ-NOTIFY-045: the retry resubmits "the last submitted prompt", and a prompt with images is more than its text.
- REQ-CHAT-170, REQ-CHAT-173: images cross the command boundary once as bytes; transcript rows keep metadata only.

## Relevant files

- `apps/desktop/src/renderer/session-actions.ts`: `retryRun`, both `submitPrompt(…, [])` calls.
- `apps/desktop/src/renderer/main.tsx`: the `retry-run` arm, which hands `retryRun` the draft's text.
- `packages/engine/src/sessions.ts`: the user row's `attachments`, and `persistAttachments`.
- `packages/contracts/src/channels.ts`: `ImageAttachmentInputSchema` (bytes) and `ImageAttachmentSchema` (the row's
  metadata).
