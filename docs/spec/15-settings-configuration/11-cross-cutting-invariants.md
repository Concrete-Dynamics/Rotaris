# Settings and Configuration — Cross-cutting invariants

Part 11 of 13 of [domain 15](../15-settings-configuration.md), which indexes every part. Defines REQ-CONFIG-448 – REQ-CONFIG-460.

### Cross-cutting invariants

- **REQ-CONFIG-448** — Absence is never an error at any level of the configuration file set.
- **REQ-CONFIG-449** — Layer order is fixed and total, with no per-key precedence inversion.
- **REQ-CONFIG-450** — The overlay is one level deep for named entries (REQ-CONFIG-046) and recursive through nested mappings inside a section (REQ-CONFIG-048); lists never append anywhere.
- **REQ-CONFIG-451** — A null at the top level cannot clear an inherited value; a null inside a named entry can.
- **REQ-CONFIG-452** — Hook provenance is stamped before merging, because it is unrecoverable afterwards; superseded hook lists are preserved, because dropping them is a privilege-reduction vector.
- **REQ-CONFIG-453** — Credentials never enter the discovery snapshot (REQ-CONFIG-213) and are redacted wherever a model entry is rendered (REQ-TOOLS-171).
- **REQ-CONFIG-454** — Unavailable models are structurally incapable of producing a client.
- **REQ-CONFIG-455** — Loader-owned synthetic model names are reserved and may be overwritten without notice.
- **REQ-CONFIG-456** — The workspace configuration directory is kept out of version control on every load, best-effort.
- **REQ-CONFIG-457** — Built-in defaults are copied per load and never mutated by a load.
- **REQ-CONFIG-458** — No surface writes a configuration it cannot load back.
- **REQ-CONFIG-459** — The settings category identifier vocabulary is append-only; an existing identifier is never re-pointed at a different category.
- **REQ-CONFIG-460** — Permission-widening changes are confirmed with the cancelling option as the default, and are not written when cancelled.
