# ADR-0036 — Configuration stays YAML files, loaded through the document tree over a tri-state model — Second execution — 2026-09-05, layer 3 folded (Part K)

Part 8 of 11 of [ADR-0036](../0036-configuration-loading.md), which indexes every part.

## Second execution — 2026-09-05, layer 3 folded (Part K)

The discovery snapshot (`project_settings.yaml`, REQ-CONFIG-034) is now layer 3 of REQ-CONFIG-031's order, read by
the loader on every load with no lock and no database handle — the guard in the signature holds. An invalid
snapshot is a warning (`Ignoring project settings snapshot: …`) and never a fatal; a `models:` entry naming an
`auth_provider` the snapshot does not mark authenticated is a referential message (REQ-CONFIG-232's family) with
REQ-WORKSPACE-133's hint, and the hint now rides on the unset-slot messages **only while no provider is
authenticated** — reading (g) of the first execution (credentials through the entry model's `api_key_env` until
ADR-0029) is closed by ADR-0030's lease. The auto-discovered-server layer (REQ-CONFIG-033) still has no producer.
Four tests over the layer; the whole package's load figure was not re-measured.
