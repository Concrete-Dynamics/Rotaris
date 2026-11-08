## A settings screen's live state outlives the screen and overrides a durable write

Reproduced 2026-11-08 by plan `rotaris-composer-mode-reset`, in the built app, from the owner's report that the
composer's permission-mode chip fell back to the default once a run started.

While the Settings view is mounted it publishes the settings store's **current** values to the run host on every change
(`config.liveState`, `liveStateOf(pending)` in the Settings hook of `apps/desktop/src/renderer/main.tsx`) — ADR-0037's
**Tier B** (REQ-CONFIG-262). The run host keeps the last state it was handed (`h.liveState = state`,
`apps/desktop/src/run-host/dispatch.ts`) and lays it **on top of the loaded files** at every run start
(`overlayLiveState`, `packages/config/src/tiers.ts`).

Nothing ever withdrew that state when the screen unmounted. The hook's effect had no cleanup, and the run host kept the
snapshot for the life of the process, so an abandoned form's values outranked every durable write made after it. For the
permission mode this is directly observable as a lost write:

1. Settings is opened once, for any reason, and left. Its live state now holds `permission_mode: ask` — the mode the
   open form held.
2. The composer's permission-mode control sets `autonomous` (REQ-TOOLS-077). That control writes its key durably
   through `config.setField` (REQ-CONFIG-288 / REQ-CONFIG-328) and applies immediately, so the file holds
   `permission_mode: autonomous` and the chip reads `mode: autonomous`.
3. A run is started. `prepareRun` loads the file — `autonomous` — and then overlays the stale live state, which puts
   `ask` back, so the run resolves `ask` (the run host's own line reads `permission_mode=ask`), the session record's
   `permission_mode` is `ask` (REQ-TOOLS-071's effective mode) and the chip falls back to `mode: ask` with it.

The same launch **without** the Settings visit runs `autonomous` throughout, which is what isolates the cause: the only
difference between the two launches is whether the screen that publishes the live state was ever mounted.

REQ-CONFIG-262's own words are about what is on screen "at that moment" — a screen that has gone holds nothing — and
tiers B and A are the same destination 1, so a Tier B overlay must never outrank a later committed write.

## Specs

- REQ-CONFIG-262 — "When a run starts, the loaded configuration is copied and the settings store's **current** values
  are layered on top, so what a run uses is what is on screen at that moment." A screen that is no longer mounted has
  no current values; a stale snapshot is what it *was* on screen, and layering it over a later write inverts the rule.
- REQ-CONFIG-288 / REQ-CONFIG-328 — the composer's permission-mode control "writes and applies immediately" and writes
  that key and no other. Its write reached the file and was then overlaid away at the next run start, so it did not
  apply.
- REQ-TOOLS-077 — the selector "shows the mode currently in effect". It showed the mode the abandoned form held, not the
  one the run was operating under.
- REQ-TOOLS-071 — the effective mode is announced in session state at run start. It was announced correctly for the
  mode the run actually resolved, which is exactly what showed the divergence from what the user chose.

## Relevant files

- `apps/desktop/src/renderer/main.tsx` — the Settings hook's `useConfiguration`, whose `config.liveState` effect had no
  cleanup.
- `apps/desktop/src/renderer/live-state.ts` — the publisher and its withdrawal; the repair's home, and where the
  behaviour is pinned by `live-state.test.ts`.
- `apps/desktop/src/run-host/dispatch.ts` — `config.liveState`, which installs the state and keeps it indefinitely.
- `packages/config/src/tiers.ts` — `overlayLiveState`, which lays the state on top of the files at every run start.
- `apps/desktop/scripts/mode-reset-repro.mjs` — the built app's own reading: the chip set to `autonomous`, a run
  started, the session's recorded `permission_mode` read from the store, with and without a Settings visit.

## Repaired 2026-11-08

The live state is now **taken down when the window that published it lets go**, and the decision of who owns the run
host's one state is main's:

- `apps/desktop/src/main/live-state.ts` (new) — the arbiter. A contribution belongs to a WINDOW, and the arbiter keeps
  each holding window's **own values**, in publish order. `release` (the Settings screen unmounted) and `gone` (the
  window's document is gone) both end a hold, and what the run host is then told is the **most recent surviving
  publisher's values** — or **"none"** (an empty state) when it was the last holder. Restoring the survivor's values
  rather than merely keeping whoever arrived last matters as soon as two windows hold distinct screens: with identities
  alone, a window leaving left the run host holding the *departed* window's settings while the other window's form was
  the one on screen. Every field of `LiveState` is optional, so `{}` overlays nothing (`overlayLiveState`), which is the
  same spelling the board elevation already uses after its granted start.
- `apps/desktop/src/main/commands/config.ts` — the one place every window's write passes. An empty `config.liveState`
  is a release, anything else a publication. It sits here rather than in the renderer because a window cannot see
  whether another window still holds a screen (REQ-SHELL-020), and a guard in one sender is one the others bypass.
- `apps/desktop/src/main/main-windows.ts` — `liveStateLost`, reported for a close (`#forget`), for a lost renderer
  (`#rendererGone`) and for a **document replacement** (`onNavigated`, an ordinary reload) alike. The last two matter
  because **neither a close nor a reload unmounts React**, so a renderer-side cleanup alone would leave a departed
  window's form in force — and a reloaded document boots on the startup view, mounting no Settings screen that could
  republish or release it.
- `apps/desktop/src/renderer/main.tsx` — the Settings hook publishes on change (unchanged) and sends the empty state in
  its cleanup effect, which is the ordinary case: leaving Settings for another view.

Nothing REQ-CONFIG-262 is about is lost: while the screen is open a run still reads its pending values, and the screen
can only be left once REQ-CONFIG-286's guard has settled it — Save or Discard — so by the time the state is taken down
the file already holds what the form held.

Evidence:

- `apps/desktop/src/main/live-state.test.ts` — the ownership rule, including the cases the first attempt got wrong:
  **distinct states released in reverse** (the survivor's own values must be restored — three cases fail on the
  identities-only rule), a document going rather than a screen, and a re-publish making a window the owner again.
- `apps/desktop/src/main/main-windows.test.ts` — a window's document going is reported on a close, on a lost renderer,
  and on an ordinary reload.
- `apps/desktop/src/renderer/settings-form-wiring.test.ts` — the hook keeps publishing and keeps letting go.
- `pnpm mode-reset-proof` against the built app: the two launches agree on `autonomous`; on the unrepaired build the
  Settings-first launch recorded `ask` while the file held `autonomous`.

