# Architecture proposals — DATA slice — ESC-1 — The shared save path between Settings and the composer's permission-mode control

Part 23 of 25 of [the data proposal](../data.md), which indexes every part.

## ESC-1 — The shared save path between Settings and the composer's permission-mode control

`REQ-CONFIG-288` states the behaviour and then explicitly hands the decision over: "The same save
path is shared with the composer's permission-mode control, with the consequence that choosing a
permission mode there **also commits every other pending Settings edit**. A rewrite must decide about
this cross-surface coupling explicitly."

The options, with what each costs:

1. **Preserve the coupling.** Matches the stated behaviour exactly. A user with unsaved Settings
   edits who changes the permission mode in the composer silently commits those edits. It is the only
   option with no conformance risk, and the only one where a user can be surprised.
2. **The composer control writes only its own key**, through the scoped per-field writer of
   `REQ-CONFIG-441`, which already exists for exactly this shape of write and "leaves every other
   runtime key in that file untouched" (`REQ-CONFIG-443`). Pending Settings edits stay pending. This
   is the smallest change and the machinery is already specified.
3. **The composer control becomes Tier B only** — it changes the live settings state, which the next
   run reads under `REQ-CONFIG-262`, and writes no file at all. `REQ-CONFIG-328` already notes the
   asymmetry that "the composer's equivalent control writes and applies immediately", so this would
   change that.

Related requirements the decision must not break: `REQ-CONFIG-423` (the Settings control shows the
permission mode held in the pending state, and a change made by any other surface writing through the
shared save path lands in that pending state and appears after the next refresh) and
`REQ-CONFIG-418` (Discard restores only workspace configuration).

I have no basis in the specification for choosing, and the difference is visible to a user in a
security-relevant control. **ESCALATE.**
