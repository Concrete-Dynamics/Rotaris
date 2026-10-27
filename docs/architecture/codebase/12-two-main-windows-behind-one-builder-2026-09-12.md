# The codebase — how the architecture is laid out in code — Two main windows behind one builder (2026-09-12)

Part 12 of 22 of [the codebase record](../codebase.md), which indexes every part.

## Two main windows behind one builder (2026-09-12)

The main window had been constructed inline in `main()` with its state in local variables — one window by
construction, and every consumer that needed "the" window written on that assumption. `buildMainWindow({
workspace, origin })` builds it now, its state lives on a record in a registry keyed by `webContents` id, and
the driver seam can address a window by index or by a suffix of its workspace path, refusing a selector that
matches nothing. The first executions are reported at ADR-0048 (the registry over *main* windows) and ADR-0055
(the builder, and consequence 6's two entrances); **both found nothing**, and the three defects they exposed
belonged to the code they replaced. A throwaway probe called the builder twice and read both renderers' title
bars, each naming its own workspace path; closing one left the survivor usable.

**The eighty-sixth — `layout-proof` pressed a chord ten milliseconds after the shell appeared, and had been
passing on luck.** The step sent `Ctrl+2` to reach the Workspace view; the driver's `chord` op carries no
readiness wait, and nothing in the step said the view had mounted. It passed for as long as the first paint
stayed cheap. `REQ-SHELL-022`'s geometry — enforced here for the first time, the window having opened 1280x820
with no minimum at all — made the first paint dearer, and the step went red against a product that was
correct: a throwaway probe showed `data-view` reaching `workspace` and the body growing from 7,303 to 40,185
bytes. The step clicks the navigation rail and waits for the view now, and a sweep of every chord-using script
found no second instance of the same race.
