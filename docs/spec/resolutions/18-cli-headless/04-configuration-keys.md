# Resolution Record — Domain 18, Command-Line and Headless Entry Points — Configuration keys

Part 4 of 4 of [domain 18's resolutions](../18-cli-headless.md), which indexes every part.

## Configuration keys

This record named `runtime.sandbox`, `runtime.session_log_level`, `runtime.message_limit` and
`runtime.event_retention_per_session`. A key is registered by domain 15, not here, and a retired
document fixes none of its own.

It also named `runtime.worktree_storage_path` (OQ 15, REQ-CLI-058), which contradicts the registered
key. The registered key is `worktree_storage_subpath` — REQ-CONFIG-068 registers it and REQ-GIT-073
defaults it to `worktrees` under the workspace configuration directory — and it is the only key that
names a **session** worktree's storage subpath (REQ-CONFIG-194). `runtime.worktree_storage_path` is
not a key of the product and is resolved by citation rather than by inventing a second name;
REQ-CLI-058 now cites the registered key. The default location this record described is unchanged by
that, a default-configured session worktree still being found at
`<workspace>/.rotaris/worktrees/<branch-name>`. This section first read that `worktree_storage_subpath`
was the only key naming *the* isolated-checkout directory; that reading was superseded by
cross-domain reconciliation. Requirement-unit checkouts are a separate directory, fixed by REQ-GIT-137
under `<workspace>/.rotaris/requirements/worktrees/`, and no configuration key of any domain names it.

Three further keys this record named have since been registered by domain 15 under terms that
supersede what is written above, a retired document fixing none of its own:

- `runtime.sandbox` (OQ 16) is not a key. Confinement is `sandbox_mode`, registered by REQ-CONFIG-127
  over the vocabulary REQ-SANDBOX-048 fixes — `off` (default), `workspace-write`, `read-only` — and an
  unrecognized value is **rejected at load** rather than read as the strictest mode.
- `runtime.session_log_level` (OQ 17) is registered by REQ-CONFIG-121 with the documented vocabulary
  `DEBUG`/`INFO`/`WARNING`/`ERROR`, default `WARNING`, and is deliberately not validated against that
  list — not the lower-case four with an `info` default and an `info` fallback stated above.
- `runtime.message_limit` (OQ 21, OQ 24) is registered by REQ-CONFIG-112 as an integer of at least 1
  or null, defaulting to **null**; null is how "no limit" is spelled, not `0`. The per-run counting
  rule the row states is unaffected.

`runtime.event_retention_per_session` (OQ 8) was registered as stated, by REQ-CONFIG-473.
