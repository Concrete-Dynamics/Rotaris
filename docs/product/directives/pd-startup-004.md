[Product directives](../directives.md) › PD-STARTUP-004

<a id="pd-startup-004"></a>

### PD-STARTUP-004 — the variable naming a launch's artifact decides updatability, and no child inherits it

**(1) A Windows build with no named artifact is not updatable.** A packaged Windows build that runs outside the directory
the installer's `InstallDir` value names, and whose launch carries no `ROTARIS_PORTABLE_ARTIFACT` naming the artifact it
started from — the payload run directly out of a preparation, or an installed tree copied elsewhere — SHALL be classified
not updatable: no check is performed and no request is issued (REQ-STARTUP-106's not-updatable branch), and one `info` log
line says why. REQ-STARTUP-106's sentence that reads a copied installed tree as portable, to be replaced by a
self-contained executable, no longer governs. `ROTARIS_PORTABLE_ARTIFACT`, which the portable launcher publishes, is a
variable of REQ-STARTUP-147's artifact-naming kind beside `APPIMAGE`, and its absence on a packaged Windows build outside
`InstallDir` decides that no check happens, where REQ-STARTUP-147 says such a variable decides nothing about whether the
check happens.

**(2) No child inherits it.** The variables that name the artifact a launch started from — `APPIMAGE` and
`ROTARIS_PORTABLE_ARTIFACT` — SHALL be read once by the main process and removed from its own environment before it starts
any child, so no run host, workspace service, tool, terminal, hook, tool server or code-intelligence branch inherits them.
REQ-STARTUP-147's variables written for child processes gain that removal, and REQ-HOOKS-032's "exactly the environment the
application itself was started with" is that environment less those two variables.

**As built.** (1) `classify.ts` in `apps/desktop/src/main/updater/` (ADR-0054, "How the artifact is identified for the update
path"). (2) `takeArtifactVariables` (`packages/platform/src/artifact-environment.ts`), called by main before it starts any
child.

**Why, and what it costs.** OQ-84: ADR-0054 moved the artifact's identity to the launcher's variable (measured:
`process.execPath` points into the preparation in 149 of 149 launches), and a copied tree and a payload run directly are
indistinguishable to the process; following REQ-STARTUP-106's sentence would also replace a tree's executable with a
single-file portable, leaving the tree's support files beside it. OQ-90: a copy of either variable that a child inherits
names an artifact that is not the child's launch, and a Rotaris started from inside one would classify itself from the
other's file. What it costs: a user who copies an installed tree elsewhere gets no updates for that copy, and a hook cannot
read which artifact started the application.

> **Narrows:** REQ-STARTUP-106, REQ-STARTUP-147, REQ-HOOKS-032

*Raised by the owner, 2026-10-06; logged as [R-071](../requests.md#r-071), the rulings of OQ-84 and OQ-90.*
