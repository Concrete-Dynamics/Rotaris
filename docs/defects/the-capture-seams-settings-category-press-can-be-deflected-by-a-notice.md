## The capture seam's Settings category press can be deflected by a notice

`ROTARIS_CAPTURE_VIEW=7` opens Settings with Ctrl+7 at `ROTARIS_CAPTURE_VIEW_MS` (600 ms by default). 200 ms later it
reads the centre of the `.nav-list__item` whose text is `ROTARIS_CAPTURE_SETTINGS` and presses there once. It never
checks that the category became selected. A notice banner drawn above the view in the same instant moves the list
down between the read and the press, and the press selects a category above the one named.
`code-intel-proof`'s `setup-again` met this on 2026-09-29: the `No model provider is authenticated yet` notice,
raised at the open's 800 ms slot, landed with the press, and Settings opened on Instructions instead of MCP Servers
(`fixed/code-intel-proofs-setup-launches-press-at-fixed-offsets.md`). That proof now corrects the category itself.
Nine other proofs open Settings the same way: `config-proof`, `init-proof`, `injection-proof`, `mcp-proof`,
`sandbox-proof`, `settings-proof`, `skills-proof`, `slice-proof` and `live-run`. Any of them can go red for this
reason alone. The press should be verified by the seam: re-read the point and press again until the item carries
`is-selected`, or log that it never did by a deadline. The same kind of repair was made for `ROTARIS_CAPTURE_CLICKS`
(`aimAt`) and for `ROTARIS_CAPTURE_RESUME` (`centreWhen`). It is not made here, because the seam is shared and a
repair owes a run of every proof above. The task that found this could not widen to that.

## Specs

None: this is harness code. A red it causes is a false red against whatever the proof stands for.

## Relevant files

- `apps/desktop/src/main/capture/seams.ts`: the `view === 7` branch of `ROTARIS_CAPTURE_VIEW`.
- `apps/desktop/src/main/capture/host.ts`: `centreWhen` and `settleAt`, the deadline forms the repair would use.
- `packages/ui/src/SettingsView.tsx`: `nav-list__item` and its `is-selected` class.
