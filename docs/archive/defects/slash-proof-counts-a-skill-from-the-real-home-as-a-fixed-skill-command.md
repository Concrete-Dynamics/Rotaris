## slash-proof counts a skill from the real home as a fixed skill command

**Outcome (repaired 2026-11-04, acceptance hrda, AF-16).** The route is traced and closed. The product reads its skill roots
(REQ-WORKSPACE-051: `~/.agents/skills`, `~/.config/opencode/skills`, `~/.openhands/skills/installed`) and its home-relative
instruction bases (PD-WORKSPACE-002) from `homedir()`, which a Windows launch cannot move (`USERPROFILE` overridden kills
Electron before it paints), and the harness named the verification seams that move it only in `skills-proof` and three
instruction proofs. `proofIsolationEnv` (`apps/desktop/scripts/lib/harness.mjs`) now names `ROTARIS_CAPTURE_SKILLS_HOME` and
`ROTARIS_CAPTURE_INSTRUCTIONS_HOME` on every launch and every platform, at the home `HOME` takes on POSIX (the caller's, or the
scratch home beside `local`, spelled for the platform), through a new `homeSeams(home)`. That reaches every proof, the driver
(`startApp`) and the live run's one launch site. The two are always named together: the run host reads
`SKILLS_HOME ?? INSTRUCTIONS_HOME` and the workspace service `INSTRUCTIONS_HOME` alone, so `injection-proof`, `settings-proof`
and `retrospective-proof`, which named only the instructions seam, and `skills-proof`, which named only the skills seam, now
spread `homeSeams(...)`, and no launch splits its home between its two processes. The packaged terminal launch
(`apps/desktop/scripts/terminal-proof/packaged.mjs`) drops them again, as `package.mjs`'s launches already drop every capture
variable but the probe's: a packaged launch is handed no seam (`terminal-proof/packaged.test.ts` held it to that).

Pinned by `apps/desktop/scripts/lib/proof-isolation.test.ts`, "a launch discovers nothing from the operator's own home": one
scratch home for both processes on all three platforms, inside the profile; every user-scope root `skillRoots` derives from it
inside the profile; a caller's home moves both seams and never `HOME` on Windows; and a scan of every script that fails one
naming either seam as a key outside `harness.mjs`. All four cases were red before the change (the Windows case read
"win32: expected undefined to be defined"); the file's 15 cases and the 86 files under `apps/desktop/scripts/lib/` pass after it.

Shown in the built app on Windows 11 ARM64, Node 26.13.0. Before the change, on the same branch (CPU load 100 %):
`pnpm slash-proof --skip-build` stopped at "exactly /skill and /skills carry the skill badge (ADR-0063): caveman,skill,skills",
its log reading `run host: skills: skipped C:\Users\ganga\.agents\skills\diagnose\SKILL.md — missing frontmatter`, `skills: 1
discovered … 1 skipped` and `context units for <session>: catalog caveman`, so the operator's skill reached a scripted run's
agent context too. After it, every launch logged `run host: skills: 0 discovered` and no skipped file; the third run (load
83 %, the acceptance tree's Electron beside it) passed the whole catalogue launch, the skill-badge check included, and the
palettes and theme-restart launches, and stopped in the `wired` launch on a reading of its own
(`docs/defects/slash-proofs-wired-launch-cannot-read-its-key-saving-eval-because-the-log-masks-the-key.md`). The first run
after it stopped earlier on another reading this repair let the proof reach
(`docs/defects/an-open-slash-popup-loses-skill-and-skills-when-the-catalogue-is-rebuilt.md`). `skills-proof` and
`retrospective-proof` (84 passed) passed with the shared seams. `injection-proof` passed its first three launches (all-on,
switch, switched), which inject the scratch home's `~/.agents` files through the shared seam, and stopped at its fourth,
`isolated`, on its known Windows reading
(`docs/defects/injection-proofs-isolated-launch-compares-a-crlf-checkout-with-the-committed-lf-text.md`). `settings-proof`
stopped at its known window reading, 1000×682 for 1000×680
(`docs/defects/plan-gate-proofs-window-reads-1000x682-where-1000x680-is-asked-on-windows.md`), before its Instructions
inventory launches, so the workspace service's half of the shared seam was not measured in the built app on this host. The live run's throwaway sign-in launch
(`--only=shell`, endpoint `katalyst`) logged `run host: skills: 0 discovered` at line 14, where the finding's pack had logged
the operator's `diagnose` skill as skipped; that run's sign-in itself failed on "Discovery request failed: The operation was
aborted due to timeout", the endpoint being unreachable from this host at the time.

The same isolation gap for the hooks discovery's Claude Code settings file is recorded on its own
(`docs/defects/proof-launches-on-windows-read-the-operators-own-claude-code-settings-for-hooks.md`), not repaired here. A
packaged build compiles the seams out (`__ROTARIS_SEAMS__`), so a packaged launch on Windows still reads the operator's home.

AF-16's second sighting, recorded with the repair: the live run's throwaway sign-in launch
(`.live-run/runs/2026-11-04T18-23-14-351Z/sign-in/app.log`, line 14, in the acceptance tree) logged
`skills: skipped C:\Users\ganga\.agents\skills\diagnose\SKILL.md — missing frontmatter`: the live run's home was not isolated
either, so its warning counts and skill set depended on the operator's machine.

`pnpm slash-proof` stops at "exactly /skill and /skills carry the skill badge (ADR-0063): caveman,skill,skills". The proof says
its launch discovers no skill, but on a host with a skill under the user's real home (`~/.agents/skills/caveman` here) that skill
reaches the launch, so the launch's home is not isolated for skill discovery. Seen 2026-11-01 on Windows 11 ARM64, Node 26.13.0,
on `fix/workspace-open-warmup-off-the-loop` and on a control build of it at `c6110962`, with the same message. The proof stops
here, so its later checks did not run on this host. That the home is the route is inferred from the skill's presence there; it
was not traced.

## Specs

None contradicted by the product: REQ-WORKSPACE-051 names the home as a skill root. The proof's claim of isolation is what is wrong.

## Relevant files

- `apps/desktop/scripts/slash-proof.mjs`: the exact-set assertion and the comment resting it on the launch's isolation.
