---
req-id: SWR-1734
status: approved
trace: required
test: required
type: technical
derived-from: SWR-770
title: "Project-settings snapshot is a versioned, atomic, secret-free store"
epic: SWR-1700
date: 2026-08-28
---

# SWR-1734 — Project-settings snapshot is a versioned, atomic, secret-free store

[SWR-770](../700-providers-auth.md) says endpoint metadata and discovered models
are stored user-wide while API keys stay in token storage. It says nothing about
the store that has to hold them. `project_settings.yaml` under
`~/.config/rotaris/` is that store, and Rotaris reads it dozens of times per
startup — once per provider, per model listing, per health check — so its
durability, its failure modes and its secret exclusion are the substance of
SWR-770's promise rather than an implementation detail of it.

`src/rotaris_core/config/project_snapshot.py` must therefore hold to:

- **Versioned schema.** The document carries a `version`; a version the reader
  does not understand, malformed YAML, or a provider entry that fails validation
  is a `ValueError` naming the offending path — never a silently empty snapshot.
- **Atomic write.** `write_snapshot()` creates the parent directory, writes
  through a temporary file in the target directory, leaves no `tmp` residue on
  success or failure, and gives the result mode `0644`.
- **Reads that stay honest.** `read_snapshot()` returns `None` for a file that
  is absent or has been deleted, sees writes made through this module, and —
  because it is cached on the file's identity — hands every caller an
  independent copy rather than a shared mutable one.
- **Provider edits preserve their neighbours.** `update_provider()` adds a new
  provider or replaces an existing one by id without disturbing the others;
  `remove_provider()` deletes one and reports `False` when there was nothing to
  delete.
- **No secrets, enforced on write.** `_assert_no_secrets()` rejects the snapshot
  when any key reads as a credential (`auth`, `token`, `secret`, `password`,
  `apikey`, `bearer`, `credential`, `session`) or any value carries a known
  credential prefix, at any nesting depth. Public model metadata that merely
  looks adjacent — per-token prices, capability flags — must still pass.

## Test coverage

Unit coverage at the module's own seam, in `tests/unit/config/test_project_snapshot.py`:
round-trip through `write_snapshot`/`read_snapshot`, atomic-write and permission
assertions, the three malformed-input `ValueError` paths, cache-copy
independence, provider add/replace/remove, and both directions of the secret
scan (credential-shaped content rejected, benign metadata accepted). The
originating product flow — a user registers a provider and its models survive a
restart without their API key ever reaching disk — is covered end to end through
`derived-from` SWR-770.

Derived from: [SWR-770 — Providers & Auth](../700-providers-auth.md)

Epic: [Configuration & MCP](../1700-config-mcp.md)
