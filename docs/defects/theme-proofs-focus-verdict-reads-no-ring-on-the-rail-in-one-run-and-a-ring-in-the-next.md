## theme-proof's focus verdict reads no ring on the rail in one run and a ring in the next

Seen 2026-11-02 by the reviewer of plan hrd2's bundle `hrd2-type-aware-lint`, on its rebased head `97bb2ce5` built in
`C:/dev/Rotaris-wt-integ-hrd2-hrd2-typeawarelin` (Windows 11 ARM64, Node 26.13.0, CPU load 83 to 100 % on 8 cores, with
twelve Electron processes of four other trees' proofs open on the same desktop). Two runs of `pnpm theme-proof` on the
same build, back to back, failed different cases:

- first run (21:46 UTC): `nocturne @ 1.75: FAIL focus`, and `nocturne @ 1.5` met the run host's hello bound
  ([the hello-bound note](../archive/defects/a-launch-whose-run-host-misses-the-hello-bound-ends-on-an-unhandled-main-rejection.md));
  `high-contrast` passed at every scale;
- second run (21:57 UTC): `high-contrast @ 1.75` and `@ 2: FAIL focus`, and `nocturne @ 1.75` failed with no driver
  endpoint within 90 s after the hello-bound rejection; every `rotaris-dim` case, `nocturne` at 1, 1.25, 1.5 and 2, and
  `high-contrast` at 1 to 1.5 passed.

The failing focus sections are not a sample of nothing: `high-contrast @ 2` tested 34 of 35 Tab stops and read a
contrast ratio of exactly 1 for nine of them (the rail's seven view buttons, Sessions, "Dismiss this error") and 1.08 for
Settings, that is, no ring painted at all where the run before had measured one at or above 3. The same code drew the
ring in one run and not in the next, so the reading depends on something other than the product's styles; a window
that has lost the operating system's foreground to another tree's window paints no `:focus-visible` ring, which would
fit, but was not measured. The bundle's diff touches no style, no focus handling and no theme token.

*Seen again 2026-11-04* by R-091's hardening bundle B2 (`hrd1-renderer-failure`, on `d2ceb85a` and `0d815666`, Windows 11 ARM64,
Node 26.13.0), whose diff adds a class that wraps no element and no style any surface draws: two runs on the same tree failed
different cases on `focus` alone — first `rotaris-dim` at 1.75 and 2, `nocturne` at 1, 1.5, 1.75 and 2, `high-contrast` at 1,
1.5, 1.75 and 2 (CPU 96 % measured after it, other trees' Electron processes open); then `rotaris-dim` at 1 and 1.5 and
`nocturne` at 1.25 and nothing else (13 Electron processes of other trees open, CPU 32 % at its start). The cases that fail move
from run to run, as this note describes; nothing was established about why.

*Seen again 2026-11-04, 03:00 to 03:17* (the consortium branch `claude/busy-noyce-b7b850` at `825eb54e`, a docs-only diff,
built in `C:devRotaris-wt-claude-busy-noyce-b7b850-land`; Windows 11 ARM64, Node 26.13.0; CPU 28 to 55 %, with the Electron
windows of two other trees on the same desktop — another session's landing tree `Rotaris-wt-claude-elastic-montalcini-d696e2-land`
running its six proof suites, and the hardening orchestration's `Rotaris-wt-hrd1-rendererfail`). Inside `pnpm worktree:land`, after a
green gate (12m25s), a green `directive-proof` and a green `layout-proof`: `theme-proof` read `FAIL focus` on eight of fifteen
cases (`rotaris-dim` @ 1, 1.5, 1.75; `nocturne` @ 1, 1.5, 2; `high-contrast` @ 1.75, 2) and `PASS` on the other seven. Rerun alone
on the same build straight after (10m18s): a different eleven failed and four passed (`rotaris-dim` @ 1, `nocturne` @ 1.5 and 1.75,
`high-contrast` @ 1.5), with 16 stale captures at `rotaris-dim` @ 1.5, 21 at `high-contrast` @ 1 and 1 at `nocturne` @ 1, and
every measured ratio at or above 3 where a capture was not stale: the verdict turned on stale captures and on cases that
passed in the other run, never twice on the same case. The branch touches no style, no focus handling and no theme token.
The landing was parked on this reading rather than retried; a desktop with no other tree's window is the condition it waits for.

## Specs

None contradicted by the code as far as shown. REQ-SHELL-145/160 (the focus ring's contrast) are what the section
measures; whether the product meets them on a desktop it does not own alone is not established either way.

## Relevant files

- `apps/desktop/scripts/theme-proof.mjs` — the focus section: Tab, capture, `focusContrast` over the focused control,
  `pass` only when every measured ratio is at least 3.
- `apps/desktop/scripts/pixels.cjs` — `focusContrast`.
- `C:/dev/Rotaris-wt-integ-hrd2-hrd2-typeawarelin/.proof/theme-proof/results.json` — the second run's figures (scratch
  evidence, removed with the landing worktree).

**Observed again, 2026-11-04 (a landing's proof run on the Overview audit's execution branch, head `c6cc5792` over `2c3a9bc9`,
Windows 11 ARM64, Node 26.13.0, the host at 73 to 100 % CPU with twelve to nineteen Electron processes of two sibling sessions'
proof runs open on the same desktop).** `pnpm worktree:land`'s `theme-proof` (02:34 to 03:07 local): every `rotaris-dim` case
passed (minimum ratios 3.20 to 4.43 over 34 to 35 stops); `nocturne` failed at every scale and `high-contrast` at 1 to 1.5. The
failing readings are the shape above, not a weaker ring: a ratio of exactly 1.00 — no ring painted — on the rail's seven view
buttons, the twelve Settings category rows, Sessions and "Dismiss this error", and 1.37 on the three window controls
(`nocturne @ 1.25`, `@ 1.75`, `@ 2`; `high-contrast @ 1.25` on the seven rail buttons); and three runs with no failing stop at all
but stale captures (`nocturne @ 1` 30 of 36 tested, `@ 1.5` 16 of 36 with a minimum of 11.19, `high-contrast @ 1.5` 21 of 36 with
3.13). The branch's diff touches no theme token and no focus handling; the controls it draws (the Overview's secondary
"Open Workspace", the StatusDot, the empty state's action slot) are in no failing list. The landing stopped with nothing
pushed, the five suites before it green on the same head (directive 12, layout 28, mission, overview, retrospective 84). Recorded,
not investigated; the suite was rerun alone on the same head and tree for the classification.

**Observed again, 2026-11-05 (a landing's proof run on branch `claude/nice-leakey-2f1678`, head `346778d5` over `a10ad853`, the
Overview audit's items 2 and 11; Windows 11 ARM64, Node 26.13.0, Electron 44.10.0; no other tree's Electron process on the desktop
before the landing started).** The same suite ran green at every theme and scale on this branch's tree about an hour earlier.
In `pnpm worktree:land`'s run, 14 of 15 cases passed; `high-contrast @ 1.25` failed its focus verdict with six of 37 tested stops at a
ratio of exactly 1.00 — the Settings category rows Models, Personas, Runtime, Interface, Display and Skills — and no stale capture.
The diff draws nothing in Settings and touches no focus handling or theme token. The landing stopped with nothing pushed, the gate
(7,896 tests), `overview-proof` and `layout-proof` green on the same head. Recorded, not investigated; the suite was rerun alone on
the same head and tree for the classification: 15 of 15 green, `high-contrast @ 1.25` among them.
