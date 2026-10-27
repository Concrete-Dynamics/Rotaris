# ADR-0042 — The desktop preference store stays a closed typed registry over an explicitly rooted per-user file — Alternatives considered

Part 2 of 9 of [ADR-0042](../0042-the-desktop-preference-store.md), which indexes every part.

## Alternatives considered

**A — The operating system's native settings API per platform.** The most literal reading of "scoped by
organisation name and application name", and one platform's redirection variable falls out for free.
*Against:* three implementations with three durability stories. The theme write must survive an
immediate power loss, and the three backends have different flush semantics — one is explicitly
asynchronous. And the **per-process redirection has no mechanism at all** on two of the three platforms,
so the benchmark's isolation requirement would need a platform-specific escape hatch in each backend:
three chances to leak into a user's real settings.

**B — A file in the application-data directory through a preferences package.** One implementation;
redirection through a single path-setting call on every platform; atomic write and flush ours to
control; the closed key set enforced by a typed accessor layer.
*Against:* a package's schema-and-defaults model **normalises on read**, which fights the
tolerant-coercion contract — a boolean stored as a string by a text backend must read as true, not fail
validation. Its migration feature has no counterpart in the requirements and would be dead weight or,
worse, a temptation. And it does not enforce a **closed** key set, which is the one property
`REQ-SHELL-006` insists on twice.

**C — Our own store, file-backed, with an explicitly resolved root.** One implementation, one format,
and a root resolved in a fixed order: **the benchmark-private variable if set; else the standard
configuration-home variable under the organisation and application pair; else the platform's per-user
application-settings location under that pair.** Chosen.

**D — Preference rows in a database (new under SR-4).** Assessed rather than dismissed, because the
question will be asked again. Four objections:

1. **Scope.** SR-4's database is one per workspace. `REQ-SHELL-006` requires the store to lie outside
   every workspace, `REQ-SHELL-069` requires pane layouts to be per user, and `REQ-GIT-153` names
   per-user rather than per-workspace scoping as the property its domain relies on. A per-workspace row
   cannot express any of that; a *second*, per-user database could, at the cost of a store engine
   holding a few dozen keys.
2. **The principle does not ask for one.** SR-4 wants a database where the data is high-volume, queried
   or transactional. This store's key set is closed by requirement, its access pattern is
   read-key-write-key, and its only atomicity obligation is that one write lands whole or not at all —
   which a staged-and-replaced file already gives.
3. **The benchmark redirection.** `REQ-UIBENCH-039` redirects an iteration by setting an environment
   variable naming a directory, and `REQ-UIBENCH-038` deletes that directory when the iteration ends. A
   file store makes that a one-line guarantee on all three platforms and makes cleanup an `rm -r`. A
   database would have to be created, opened, closed and deleted per iteration, and any handle left open
   is a file the iteration failed to remove — `REQ-UIBENCH-046` requires a completed run to leave no
   file behind outside its own output directory.
4. **Start-up ordering.** The root must be resolved and the theme read **before the first window
   becomes visible** (`REQ-SHELL-009`) and before the first preference read (`REQ-SHELL-006`). That is
   ahead of any workspace being open, so no workspace database exists yet.
