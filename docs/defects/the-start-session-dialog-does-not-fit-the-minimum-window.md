## The start-session dialog does not fit the minimum window, and its two buttons fall off the screen

At the window's own minimum of 1000×680 (`REQ-SHELL-022`), the start-session dialog measures 560×**727** and is
positioned at y = 16, so it ends 63 px below the viewport. The two actions sit at the bottom of that box, which
puts both of them off screen:

```json
{"kind":"CONTAINMENT","view":"overlay: start-session dialog","size":"1000x680",
 "box":{"x":220,"y":16,"w":560,"h":727},"viewport":{"w":1000,"h":680}}
{"kind":"STACKING","el":".btn.btn-secondary","at":"(off screen)","cx":622,"cy":707,"text":"Cancel"}
{"kind":"STACKING","el":".btn.btn-primary","at":"(off screen)","cx":711,"cy":707,"text":"Start session"}
```

The dialog does not scroll, so at the minimum window a pointer can neither start the session nor cancel out of
the dialog; `Escape` is the only way out, and it is not drawn anywhere. The same dialog at 1400×900 is clean,
which is why the ordinary development window never shows it.

Found on 2026-09-16 by `pnpm ui-review -- --iteration=1` while gathering evidence for `PD-CHAT-004` revision 2
and `PD-CHAT-005`. Not repaired here: the transcript change touches no overlay, and the fix is a decision about
which of the dialog's sections gives up height or scrolls.

## Specs

`REQ-SHELL-022` fixes 1000×680 as a size the window refuses to go below, and `REQ-SHELL-061` describes the
Workspace view working at exactly that size — a surface that cannot be completed or dismissed there contradicts
both. `REQ-SHELL-023`'s reachability and the seven primary views are unaffected; this is one overlay.

## Relevant files

- `packages/ui/src/` — the start-session dialog and its footer of actions.
- `apps/desktop/scripts/ui-audit.mjs` — the sweep that measures overlays at both sizes; `CONTAINMENT` and
  `STACKING` are its own kinds.
- `.ui-review/d0feea476077/iteration-1/report.json` — the three findings quoted above, with the screenshot
  `overlay-start-session-dialog-1000x680.png` beside them.
