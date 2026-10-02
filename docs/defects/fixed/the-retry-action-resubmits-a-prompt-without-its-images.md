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
last prompt" command, or a read of the session's files), which is more than the retry's wiring. OQ-178 already asks
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

## Outcome

Repaired 2026-10-02 (fin8, bundle `fin8-focus-bound-recovery`), on the engine-side retry of
[the-retry-action-reads-the-last-prompt-from-the-resident-window.md](the-retry-action-reads-the-last-prompt-from-the-resident-window.md).
`Sessions.retry` resubmits the last submitted prompt with its images: `readBackAttachments`
(`packages/engine/src/attachments.ts`) reads each stored image back by its relative path below the session's directory
and verifies it against its recorded digest (`readAttachmentBody`, REQ-CHAT-173), so the bytes never cross the command
boundary a second time, and `prompt` stores and sends them as it does a composer's — the new user row carries the same
digest. A missing or altered image refuses the retry with the image named ("…because its image shot.png could not be read
back: Image is no longer available.") rather than resubmitting less than was sent. REQ-CHAT-171's gate is `prompt`'s,
checked against the model the retry runs on. The authentication restarts (`restartOnFallback`, the recovery dialog's) keep
re-sending the text alone under OQ-182's reading, though the shared reading returns the images.

Not covered here, and raised: a NON-blank draft is still resubmitted as its text, the images held in the composer staying
there (OQ-183, whether the "current composer draft" includes them).

Pinned by `packages/engine/src/last-prompt.test.ts` (a prompt with one PNG, failed and retried: the new row carries the
same digest and the model is sent the bytes; the same for a prompt released from the resident window; a missing and an
altered image refuse naming `shot.png`; a model without image input refuses) and shown in the built application by
`pnpm notice-proof`'s `retry-image` launch (a failed session whose prompt, one PNG attached, is released, reopened and
retried: the retried row's digest and the digest of the image the model port received equal the stored one).
