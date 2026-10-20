## terminal-proof's header check ignores the command label's 90-character elision

Seen 2026-10-21 by the reviewer of plan loc1's bundle `loc1-terminal-kill`, running `terminal-proof` in its landing tree
`C:/dev/Rotaris-crw-wt-integ-loc1-loc1-terminalkill` at `edd65901` (Windows 11 ARM64, build 26200, Node 24.18.0 arm64,
Electron 44.1.1 arm64, pwsh 7.6.6), in every run there (four): `live.headerCommand` red, the header reading
`$ node "C:\dev\Rotaris-crw-wt-integ-loc1-loc1-terminalkill\.proof\terminal-proof\out\echo.c…`. The same proof had this
check green in the bundle's own tree, `C:/dev/Rotaris-crw-wt-loc1-terminalkill`, on the builder's runs.

The check compares the header's text with the whole command (`$ ${echoCommand}`, `echoCommand` being `node "<echo script>"`
under the tree's `.proof/` directory), but the header elides a command past 90 characters (`commandLabel`, REQ-SHELL-087's
"elided at 90 characters") and keeps the whole one in its tooltip. The command's length is the tree's path length: 94
characters with the label's `$ ` in the landing tree, 83 in the bundle's tree. So the check is red in any tree whose path makes
the command longer than the label shows, whatever the product does, on any platform. The product behaves as specified.

Not repaired (record-only): the reviewer recorded it while landing another bundle.

## Specs

None contradicted by the product. The proof's expectation contradicts REQ-SHELL-087 (the header's command elided at 90
characters, the whole one in the tooltip).

## Relevant files

- `apps/desktop/scripts/terminal-proof/main.cjs` — `live.headerCommand`, which compares `[data-testid="term-command"]`'s text
  with `$ ${echoCommand}` whole; the tooltip (`title`) carries the whole command.
- `packages/ui/src/terminal/labels.ts` — `commandLabel`, the elision at `COMMAND_LABEL_MAX`.
- `packages/ui/src/terminal/TerminalTab.tsx` — the header's `term-command` span.
