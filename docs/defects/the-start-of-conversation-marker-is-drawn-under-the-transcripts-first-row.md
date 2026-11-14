## The start-of-conversation marker is drawn under the transcript's first row

While the transcript's first row is on screen, the line "This is the start of the conversation." is painted across the top edge of that row: the marker is a block in the row pool's flow (`.transcript__oldest`, 32 px high) and the pooled rows are positioned from the pool's top, so the first row stands over it. Seen at 1440×900 in a scripted run short enough to show its first row (the marker's box at y 186 to 218, the first row's top at about y 199); with a longer transcript the marker is scrolled away and nothing shows.

Noticed 2026-11-14 by an independent critique of the built application for [R-101](../product/requests.md#r-101) (finding D-05 of [the shell's brief](../design/briefs/shell.md)). That round changed neither the marker's rule nor the pool; whether `main` at `2fb19824` draws the same was not checked in the built application.

## Specs

REQ-CHAT-055's row pool positions rows by measured offsets (ADR-0045); no requirement was found that places the marker. A marker sharing pixels with a row contradicts REQ-SHELL-022's "no control or text is drawn over another" as the layout proofs read it.

## Relevant files

- `packages/ui/src/transcript/TranscriptPane.tsx` — draws the marker and the pool.
- `packages/ui/src/shell.css` — `.transcript__oldest`.
