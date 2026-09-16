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
