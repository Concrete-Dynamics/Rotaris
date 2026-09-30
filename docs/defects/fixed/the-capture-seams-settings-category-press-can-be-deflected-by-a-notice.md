## The capture seam's Settings category press can be deflected by a notice

`ROTARIS_CAPTURE_VIEW=7` opens Settings with Ctrl+7 at `ROTARIS_CAPTURE_VIEW_MS` (600 ms by default). 200 ms later it
reads the centre of the `.nav-list__item` whose text is `ROTARIS_CAPTURE_SETTINGS` and presses there once. It never
checks that the category became selected. A notice banner drawn above the view in the same instant moves the list
down between the read and the press, and the press selects a category above the one named.
`code-intel-proof`'s `setup-again` met this on 2026-09-29: the `No model provider is authenticated yet` notice,
raised at the open's 800 ms slot, landed with the press, and Settings opened on Instructions instead of MCP Servers
(`code-intel-proofs-setup-launches-press-at-fixed-offsets.md`). That proof's correction, a second press at 3 s
and 6 s, came too late for `setup-cancel`, where the deflected press took the card off screen between Start and
Cancel (three reds in seven runs, 2026-09-29). That proof no longer uses this seam: it opens Settings with the Ctrl+7
chord and presses only after the notice has drawn.
Nine proofs still open Settings this way: `config-proof`, `init-proof`, `injection-proof`, `mcp-proof`,
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

## Outcome

Repaired 2026-09-29 under R-067. The `view === 7` branch now calls `pressCategory` (`capture/host.ts`) instead of
pressing once. The first press still lands 200 ms after the chord, as before. After it, the item is read again with
`categoryProbe`, which returns the point and whether the item carries `is-selected`. The seam presses again, 150 ms
apart, until the item is selected. A category that is already selected is not pressed at all. The seam logs the
outcome either way: `Settings category "<label>" selected after <n> presses with <ms> ms to spare`, or `never selected
within 5000 ms`, or `no Settings category … on screen` at the deadline. Time comes from the clock ports.

Pinned by `apps/desktop/src/main/capture/seams.test.ts`, which drives `installSeams` against a model of Settings where a
notice moves the list one row in the same instant as the first read. It has three cases: a deflected first press is
corrected by a second one; an undisturbed press is made once, and never when the category is already selected; a press
that is always deflected is logged at the deadline, and pressing stops there. All three fail on the old seam. A fourth
case, in `host.test.ts`, checks that `categoryProbe` quotes its label and reads `is-selected`.

Shown in the built app (Node 24, root, Xvfb, `--skip-build`): `settings-proof`, `config-proof`, `skills-proof`,
`sandbox-proof`, `injection-proof --skip-latency` and `init-proof` all passed. Every Settings launch in them logged the
named category as selected. `init-proof` first went red twice in its first scenario, which does not open Settings. The
worktree had no code-intelligence bundle (`pnpm code-intel:bundle`). With the bundle built it passed. Twenty-six more
launches opened `MCP Servers` in a profile with no provider, so the `No model provider is authenticated yet` notice drew
at the open's 800 ms slot, with the open at 450 to 700 ms: sixteen on a quiet host, ten with `pnpm check` running
beside them (load average 4.4). Every one ended on `MCP Servers` after one press. The notice never landed between the
read and the press, so the corrected path was not met in the built app; the unit cases are its evidence.

The list above was one wrong: `mcp-proof` does not use this seam; it opens Settings through the driver (`waitFor`, then
`click` on the category). `slice-proof` and `live-run` do use it, on `Models`, the category a fresh profile opens Settings on, so the seam
now presses nothing there. `slice-proof` was not re-run, because it waits for a person to paste a key. `live-run
--only=ask` was run on the branch's build on 2026-09-30 against the unmetered `katalyst` endpoint and passed. Its
sign-in launch logged `Settings category "Models" selected after 0 presses` (pack
`.live-run/runs/2026-09-30T12-42-18-802Z`).
