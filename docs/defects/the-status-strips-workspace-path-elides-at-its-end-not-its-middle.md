## The status strip's workspace path elides at its end, not its middle

The status strip's workspace-path link (drawn since fin10's repair of
[the strip's note](fixed/the-status-strip-applies-no-responsive-hiding-and-overflows-at-the-minimum-window.md)) is a strip
item like the others: a label longer than 28 characters may shrink, and CSS `text-overflow: ellipsis` cuts it at its
**end**, so a deep path keeps its beginning (`/tmp/claude-0/-home-user-…`) and loses the folder name that tells workspaces
apart. REQ-WORKSPACE-149 rule 2 requires the status-bar path link, like the title-bar chip, to be shortened from the
**middle** against its measured width, the removed span one `…`, and hidden rather than clipped where even `…` does not fit.
The title-bar chip does this (`elideMiddle`, `packages/ui/src/workspace-label.ts`, measured in `WorkspaceChip.tsx`); the strip
does not measure its items. Seen 2026-10-02 with `pnpm app:drive` at 1180 px under a 96-character scratch path: the label
took the whole of the spacer's slack (0 px left) and showed the path's head. Noticed while building that link; not repaired
there, since the strip's flex layout gives the item no width of its own to measure against.

## Specs

- REQ-WORKSPACE-149 rule 2: middle elision of the status-bar path link against the rendered width available to it.
- REQ-WORKSPACE-021: hiding (by REQ-SHELL-047) removes the label only; rule 2 hides a label that cannot hold `…`.

## Relevant files

- `packages/ui/src/AppShell.tsx`: the strip draws the link as a `Button` with the item classes, no measurement.
- `packages/ui/src/shell.css`: `.status-strip__item[data-elide='1']`, the end-ellipsis shrink every long item takes.
- `packages/ui/src/workspace-label.ts`, `packages/ui/src/WorkspaceChip.tsx`: the middle elision the chip already applies.
