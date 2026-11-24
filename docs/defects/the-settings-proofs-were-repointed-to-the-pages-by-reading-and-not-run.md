## The Settings proofs were repointed to the pages by reading, and not run

`PD-CONFIG-012` replaced the thirteen Settings categories as navigation entries by a Setup page and twelve pages. Every
proof script that opened a category by its label was edited to name the page that now holds what it drives, by reading
the script and not by running it: the owner's instruction for that work was that tests run on the hosted runner, and the
hosted runner runs no proof suite (R-079). So each of these is unverified against the built product:
`config-proof`, `sandbox-proof`, `mode-reset-proof`, `init-proof`, `skills-proof`, `mcp-proof`, `code-intel-proof`,
`mission-proof`, `store-resolution-proof`, `notice-proof`, `settings-proof`, and `lib/settings-runtime-field.mjs`
(`continuation-proof`, `retrospective-proof`, `live-run`).

One launch is known to be wrong as edited: `settings-proof`'s `reload-last-write` reads the circuit breaker and the
permission mode in one launch, and they stand on two pages now (Delegation and Permissions). Launches that probe a
row's caption by its visible box may also read differently, since a caption is closed until asked for.

Also unrepaired: a proof or capture that opened Settings and relied on the Models category being the first shown now
meets Setup.

## Run on 2026-11-18 and 2026-11-19, on the Linux agent host

Eleven of the suites `pnpm verify:plan` names for the change were then run on this host, one at a time, against the
branch at `ce5732e2` with the repairs below.

- **Green:** `sandbox-proof`, `mode-reset-proof`, `skills-proof`, `mcp-proof`, `layout-proof`; and, after a repair to
  the script, `settings-proof`, `store-resolution-proof` and `notice-proof`. The three repairs were of what a script
  read back, not of the product: the selected entry's name, the body's label, and `settings-proof`'s
  `reload-last-write`, which now moves access beyond the workspace (a value beside the permission mode) where it moved
  the circuit breaker.
- **Red here and on `main` alike** (`131d02cb`, run the same night): `config-proof` at "the models save did not write
  the slot and its companion" (its Permissions step passed twice; one earlier red there was a Save press that landed
  as a notice moved the page, under a load average of 14); `mission-proof` at "the confirmation did not name the agent
  and the cascade", before it reaches Settings; `theme-proof` on focus-ring contrast for controls across the shell and
  on the dash glyph's contrast, with most focus captures stale on both trees. None of the three is evidence for or
  against this change.
- **A second batch, 2026-11-19:** `settings-proof` again, `continuation-proof`, `retrospective-proof` and
  `directive-proof` green, so `lib/settings-runtime-field.mjs`'s page choice is run. `workspace-proof` and
  `exit-trace-proof` red, at checks that name no Settings surface (Chromium's profile directory and a setup start the
  run host never answers; the renderer-crash line) and that this host's notes already list as red on `main`.
- **Not run:** `init-proof` and `code-intel-proof` (the code-intelligence bundle is absent on this host), `live-run`,
  `portable-proof`, `updater-proof`, `linux-acceptance-proof`. After the critique's repairs of 2026-11-19
  `settings-proof` and `sandbox-proof` were run again and are green; the others were not.

## Specs

- `AGENTS.md`, "The proof scripts": a proof is evidence of the product, and a change that moves a shared seam runs the
  whole suite it touches. This change did not.
- `PD-CONFIG-012` (the pages), REQ-CONFIG-269 (the identifiers the capture seam's labels stood beside).

## Relevant files

- `apps/desktop/scripts/*-proof.mjs` named above, and `apps/desktop/scripts/lib/settings-runtime-field.mjs` — the label each passes to `ROTARIS_CAPTURE_SETTINGS` or clicks.
- `apps/desktop/src/main/capture/seams.ts` — the seam's default page, now `Session store`.
- `packages/ui/src/settings/pages.ts` — the pages and the category-to-page table.

## Run on 2026-11-24, on the Linux agent host

`mission-proof` is red on `main` (`0cbd3058`) and on the R-126 branch alike, at its Settings step and no longer at the
confirmation: "Settings → Runtime shows strategy undefined, depth undefined" (`mission-proof.mjs:873`). The file write it
checks one line earlier passed (`delegation_strategy: swarm`, `max_depth: 2`); the end probe reads `#strategy` and
`#max-depth` on a page that the "Open Runtime settings" press lands on as Delegation, so the probe's selectors are what
was repointed by reading. Run under `env -u WAYLAND_DISPLAY -u XDG_SESSION_TYPE xvfb-run -a -s "-screen 0 1600x1000x24"`.
