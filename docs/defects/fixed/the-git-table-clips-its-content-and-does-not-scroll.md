## The Git view's table clips 12 px of its content and does not scroll

At 1000×680 the Git view's table reports a client width of 338 px around content that needs 350 px, with no
scroll on that axis:

```json
{"kind":"SHRUNK","view":"Git","size":"1000x680","element":".table.git__table","component":"Table","axis":"x",
 "detail":"client width 338 holds content 350 and does not scroll"}
```

Twelve pixels of the widest column are therefore unreachable at the minimum window: not truncated with a marker,
not scrollable to, simply outside the box. At 1400×900 the same table is clean.

Found on 2026-09-16 by `pnpm ui-review -- --iteration=1` while gathering evidence for `PD-CHAT-004` revision 2
and `PD-CHAT-005`. Not repaired here — the change being built touches the transcript only.

## Specs

No requirement states the Git table's column widths. `REQ-SHELL-022` fixes 1000×680 as the minimum the window
allows, so a surface that hides content there is a defect against the minimum rather than against the table.

## Relevant files

- `packages/ui/src/` — the Git view and the shared `Table` component the finding names.
- `apps/desktop/scripts/ui-audit.mjs` — `SHRUNK` is its measurement of content wider than its own scrollless box.
- `.ui-review/d0feea476077/iteration-1/report.json` — the finding, beside `5-git-1000x680.png`.

**Repaired 2026-09-22.** Reproduced first, on the built app at 1000×680, before anything was changed:
`SHRUNK Git @ 1000x680 — .table.git__table, client width 340 holds content 352 and does not scroll`. Driving
the app named the one of the view's three tables that it is: **Worktrees**, at x=125, 340 wide; the
checkpoint and history tables are clean.

The finding is two faults, and the earlier round in `shell.css` answered only one of them. Its measurement
still stands and is kept above the replacement: seven columns cannot fit this pane, and choosing between a
narrower checkpoint column, a stacked layout and fewer columns is the design material's call. Re-measured
live, the content floor is Branch 59 (heading; the cell elides), Session 53, State 59, Ahead 49, Behind 49,
Files 73, Actions 58 — **400 px of floor in a 340 px pane**, which is why the two nudges that round tried
could not move the number and why neither was kept.

But the note's complaint is not that the table is cramped. It is that twelve pixels are **unreachable** —
"not truncated with a marker, not scrollable to, simply outside the box" — and that half has an answer that
takes none of those three decisions, because this view already made it once: the checkpoint table carries
`min-width: 560px` and scrolls when its columns exceed its card. The worktrees table now does the same. A
`<colgroup>` gives the five columns that cannot give way the width they need, Branch and Session elide
(UIR-002) into the remainder, the table carries `min-width: 408px`, and the card's existing
`overflow-x: auto` does the scrolling. Nothing is dropped; nothing the design owns is decided.

Measured, built app, 1000×680: the table reads **client 408, scroll 408** — no overflow at all — inside a
card reading **client 340, scroll 408**, so every column is reachable; and every fixed column's box now
equals its need exactly (`Session 56/56, State 64/64, Ahead 52/52, Behind 52/52, Files 76/76,
Actions 64/64`). `pnpm ui-audit` over all seven views at both sizes went from **1 finding to 0**. Pinned by
a new case in `packages/ui/src/layout-regression.test.ts`, beside the checkpoint table's own.
