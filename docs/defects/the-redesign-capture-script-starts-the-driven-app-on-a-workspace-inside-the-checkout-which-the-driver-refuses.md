## The redesign capture script starts the driven app on a workspace inside the checkout, which the driver refuses

Noticed 2026-11-20, while capturing the transcript for [R-109](../product/requests.md#r-109).
`.agents/skills/redesign-surface/references/capture.sh` sets its scratch workspace to `$OUT/../scratch-workspace`. With
the output directory under `.ui-review/` in the checkout, where the skill's phase 4 places it, `pnpm app:drive start`
answers "refusing --workspace inside the checkout" and exits 2. The script goes on: every later step fails into
`last.json`, no PNG is written, and its last line still prints `captured <dir>` with exit code 0. Worked around by
starting the app by hand on a workspace outside the repository.

## Specs

None. The skill's phase 2 ("Capture the surface as built") cannot run as written.

## Relevant files

- `.agents/skills/redesign-surface/references/capture.sh`: the `WS=` line, the unchecked `start`, the unconditional final `echo`.
- `apps/desktop/scripts/drive.mjs`: the refusal, which is correct.
