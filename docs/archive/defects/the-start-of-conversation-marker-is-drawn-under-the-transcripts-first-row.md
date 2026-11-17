## The start-of-conversation marker is drawn under the transcript's first row

While the transcript's first row is on screen, the line "This is the start of the conversation." is painted across the top edge of that row: the marker is a block in the row pool's flow (`.transcript__oldest`, 32 px high) and the pooled rows are positioned from the pool's top, so the first row stands over it. Seen at 1440×900 in a scripted run short enough to show its first row (the marker's box at y 186 to 218, the first row's top at about y 199); with a longer transcript the marker is scrolled away and nothing shows.

Noticed 2026-11-14 by an independent critique of the built application for [R-101](../../product/requests.md#r-101) (finding D-05 of [the shell's brief](../../design/briefs/shell.md)). That round changed neither the marker's rule nor the pool; whether `main` at `2fb19824` draws the same was not checked in the built application.

**Repaired 2026-11-17 (R-102, on the owner's word "Start-marker overlap").** The marker, and the failed-page notice that stood beside it in the same flow, are drawn in the first row's slot, above the row, where the pool measures them: the slot's height is the row's and the lead's together, filed under a key of its own (`leadKey`) so the row measured alone does not answer for it, and estimated with `SLOT_LEAD_ESTIMATE` until its first measurement. Nothing in the offset table, the visible range or the scroll arithmetic changed, and the pool's origin is where it was. Measured in the built application at 1440×900 (`pnpm app:drive`, a scripted run of four rows, the oldest page reached): the marker's box y 176 to 208, the first row's top y 220, no two bound slots sharing a pixel, the pool's height equal to the last slot's bottom. `packages/ui/src/transcript/transcript.test.ts` holds the key and the estimate. With no row displayed the marker is not drawn: the empty state stands there.

## Specs

REQ-CHAT-055's row pool positions rows by measured offsets (ADR-0045); no requirement was found that places the marker. A marker sharing pixels with a row contradicts REQ-SHELL-022's "no control or text is drawn over another" as the layout proofs read it.

## Relevant files

- `packages/ui/src/transcript/TranscriptPane.tsx` — draws the marker and the pool.
- `packages/ui/src/shell.css` — `.transcript__oldest`.
