# ADR-0048 — Windows, views and the three modality levels — The registry over MAIN windows — first executed 2026-09-12 (the builder)

Part 9 of 13 of [ADR-0048](../0048-windows-views-and-modality.md), which indexes every part.

## The registry over MAIN windows — first executed 2026-09-12 (the builder)

This record's registry had only ever run over the windows a main window *owns* — Part R's persona windows,
Part AL2's terminal window. Its own subject, the main window, was still one `BrowserWindow` constructed
inline in `main()` with its state in local variables, so the registry existed in this record and nowhere in
the composition root.

`buildMainWindow({ workspace, origin })` builds it now, and a `MainWindowState` record holds what belongs to
a window: the window and its `webContents` id, the workspace and its identifier, the followed session, the
approval queue and its open dialog, the persona and terminal registries, and the minted launch-dialog session
id (`REQ-GIT-118`). A registry keyed by `webContents` id holds the records and answers three questions a
single-window build never had to distinguish — the window that RAISED a command (`REQ-SHELL-020`), the window
that OWNS a session, and the window that owns a persona or terminal window asking for its own payload.

**It found no defect**, which is worth recording in a register where nearly every mechanism's first execution
has held one. What it found instead were three defects in the code it replaced, every one of them invisible
while the capacity was one: `runCommand`'s default sender was the first window's id, so a command from a
verification seam or the driver was answered for that window whatever else was open; and
`window.showWorkspace` and the instance hand-over each surfaced "the" main window, which with two open is the
wrong one. One latent violation went with them — a single application-wide approval-dialog slot with
`getAllWindows().find(...)` parenting, which could have put one project's permission prompt over another
project's window (`REQ-TOOLS-063`).

Measured rather than argued: a throwaway probe called the builder twice and read both renderers' title bars,
each naming its own workspace path; closing one left the survivor usable and removed it from the registry and
from the focus ordering. What is **not** yet measured, and is owed to `workspace-proof`: approval parenting
with two windows live, the notice store's application-wide broadcast (ADR-0049's open decision),
`REQ-STARTUP-043`'s constructed-but-unshown window, and a second workspace service.

*Note on deepened structure (2026-09-12):* The main window registry, per-window lifecycle state, and focus
order now live inside `MainWindows` (`apps/desktop/src/main/main-windows.ts`) with Electron and in-memory adapter
seams, replacing the inline records in `index.ts`. All behavior, attribution, and modality rules remain identical.
