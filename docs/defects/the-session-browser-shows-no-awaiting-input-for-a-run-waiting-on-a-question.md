## The Session Browser shows no awaiting-input tag for a run waiting on a question

The session listing computes `awaitingInput` from `pending_approvals` alone (`Sessions.list`,
`packages/engine/src/sessions.ts`: `awaitingInput: parsePending(row.pending_approvals).length > 0`), and the Session
Browser draws its "awaiting input" tag from that flag (`packages/ui/src/SessionBrowser.tsx`). A live run whose agent waits
on an `ask_questions` prompt is therefore listed without the tag, though the user's answer is exactly what it waits on.
Nothing in the store says a question is pending (the prompts live in the run host's memory), so the listing, which reads
the store, cannot see one.

## Specs

`REQ-SESSION-031` (not narrowed by any directive): `awaiting_input` is true when the session has pending approvals **or
pending questions**.

## Relevant files

- `packages/engine/src/sessions.ts` — the listing's `awaitingInput`.
- `packages/ui/src/SessionBrowser.tsx` — the tag drawn from it.
- `apps/desktop/src/run-host/tools.ts` — where the pending questions live.
