# Resolution Record — Domain 13, Workspace Handling, Context Injection, and Project Onboarding — New requirements

Part 3 of 4 of [domain 13's resolutions](../13-workspace-context-onboarding.md), which indexes every part.

## New requirements

| ID | Section | What it carries |
| --- | --- | --- |
| REQ-WORKSPACE-148 | Application Launch and File-Access Boundary | The file-access boundary as the configuration setting `runtime.allow_outside_workspace` (REQ-TOOLS-130), edited in the Settings Runtime category, reflected by the status-bar flag of REQ-WORKSPACE-022. Rescues REQ-WORKSPACE-004. |
| REQ-WORKSPACE-149 | Workspace and Branch Label Rendering | Home-directory collapsing, middle elision to a single `…` against the rendered width available with the full text in tooltip and accessible description, and literal (never markup-interpreted) rendering, wherever the window chrome shows a workspace path or branch name. Rescues REQ-WORKSPACE-023, REQ-WORKSPACE-024 and REQ-WORKSPACE-027. |
| REQ-WORKSPACE-150 | Workspace and Branch Label Rendering | The desktop status bar's git refresh: 10.0 s cadence measured from completion, immediate refresh on a workspace or session switch, off the interface's thread of control, non-overlapping, stale results discarded, and no refresh or timer at all while the bar is off screen. Rescues REQ-WORKSPACE-025 and REQ-WORKSPACE-026. |
| REQ-WORKSPACE-151 | Typeable Commands from Skills (Desktop Composer) | Loading a `SKILL.md` by hand: a "Load skill file…" action in the Settings Skills tab opening the platform file chooser, applying REQ-WORKSPACE-057 with scope label `manual`, session-scoped, persisting nothing. Rescues REQ-WORKSPACE-075. |
| REQ-WORKSPACE-152 | First-Launch Provider Guidance and Login | Where the guided provider setup of REQ-WORKSPACE-135 is reached from: the Settings Models category (fresh start, and per-provider re-authenticate), the refusals of REQ-WORKSPACE-137, and a dismissible persistent INFO notice on a first launch with no authenticated provider. Rescues REQ-WORKSPACE-134 and REQ-WORKSPACE-136. |
| REQ-WORKSPACE-153 | Cross-Cutting Invariants | Visual appearance follows the active theme and no requirement here fixes a colour, font or spacing value; the timing and pixel figures this domain states are normative and are not theme tokens; REQ-SHELL-149, REQ-SHELL-135 and REQ-SHELL-022 bind every surface here. Resolves open question 8. |
