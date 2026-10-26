# ADR-0055 — Startup sequencing, the instance claim, and the first-paint budget — Corrected on the Overview's first execution — 2026-09-05: a view's start-time read arrives before the workspace is open

Part 11 of 17 of [ADR-0055](../0055-startup-sequencing.md), which indexes every part.

## Corrected on the Overview's first execution — 2026-09-05: a view's start-time read arrives before the workspace is open

*The seventeenth first-execution defect (ADR-0058 c.17).* Main loads the window (`loadFile`) and only then opens the
argument workspace, so the renderer's startup view mounts and issues its first reads — the session list and
REQ-GIT-102's one refresh at start, which the requirement places "after the window has first been drawn" — while
`currentWorkspaceId` is still undefined, and both were refused with "open a workspace before …". The Overview
showed its empty state and never read the repository. The order is right (REQ-STARTUP-156's first paint comes first)
and the refusal was wrong: `session.list` and `repository.read` now **wait, bounded at 30 s, for the open in
flight** (`workspaceReady`, set by every `openWorkspace` call) before deciding there is no workspace. The falsified
reading — "a command that names the current workspace can be answered from the current state" — held for every
command a person sends, because a person cannot click before the open completes; a view that reads at mount can.
