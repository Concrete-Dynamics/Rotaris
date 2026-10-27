# Architecture proposals — DATA slice — E. When a change takes effect

Part 6 of 25 of [the data proposal](../data.md), which indexes every part.

## E. When a change takes effect

**E1 — Three tiers, and Tier B is an architectural requirement, not a UI convenience. (hard)**
`REQ-CONFIG-261` (**Tier A**): a desktop settings save re-runs the configuration load at the end,
so a saved change is reflected within the same action, with no restart.
`REQ-CONFIG-262` (**Tier B**): "When a run starts, the loaded configuration is copied and the
settings store's **current** values are layered on top, so what a run uses is what is on screen at
that moment, not whatever was last committed to the file. The dirty flag therefore governs the
**file**, not the **next run**."
`REQ-CONFIG-263` fixes the overlay contents, and one clause is load-bearing: the five model slots
are overlaid "**synthesizing slot-level reasoning variants on the fly exactly as the loader does**".
The loader's synthesis step (`REQ-CONFIG-076`, `REQ-CONFIG-079`, `REQ-CONFIG-081`) must therefore be
a callable transform over a configuration value, not a phase buried inside a file-reading pipeline.
The overlay also strips the delegate tool from every role under a `single` delegation strategy, and
filters tool servers to those both enabled and available in the UI.
`REQ-CONFIG-265` (**Tier C**): everything else — verification, hooks, checkpoints, requirements,
transcript, project classification, model entries beyond the five slots, tool-server definitions —
takes effect at the next workspace open or application start.
`REQ-CONFIG-264`: the permission-mode overlay sets the runtime field only; per-role permission pins
are never widened by it.

**E2 — Bounds on observing an out-of-process change. (hard)**
`REQ-CONFIG-266`: the discovery snapshot is picked up on the `(mtime, size)` rule of
`REQ-CONFIG-211`; a change to the **published desktop artifact set** — any addition, removal or
revision in the workspace's artifact library, whoever made it — is reflected within **750 ms**, and
that figure is an upper bound on how long the change may take to appear, **not a polling interval**;
a change made inside this process appears without waiting for it. The resolved per-user
configuration directory is fixed for the life of the process, so a change to it takes a restart.

**E3 — Two settings surfaces share one save path, and the coupling is flagged for a decision.
(hard, with an escalation)**
`REQ-CONFIG-288`: "The same save path is shared with the composer's permission-mode control, with
the consequence that choosing a permission mode there **also commits every other pending Settings
edit**. A rewrite must decide about this cross-surface coupling explicitly." See **ESC-1**.

**E4 — Five persistence destinations, only one of which participates in Save/Discard. (hard)**
`REQ-CONFIG-417`, `REQ-CONFIG-418`. (1) workspace/global YAML configuration, committed by Save —
with one stated exception, the diagnostics toggle of `REQ-CONFIG-471`, which writes its single key
immediately through the scoped per-field writer and is consequently not undone by Discard;
(2) desktop preferences, written the moment the control moves; (3) the external hook policy store,
written immediately by the hook checkboxes (`REQ-CONFIG-360`); (4) provider credential storage and
the provider catalogue, written asynchronously and entirely outside the dirty flag; (5) theme and
reduced motion, persisted by their own services. Tool-server enablement is **not** a further
destination: toggling a server records a session-scoped override that a run picks up per
`REQ-CONFIG-263`.
