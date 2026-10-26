# Settings and Configuration — Directory layout

Part 12 of 13 of [domain 15](../15-settings-configuration.md), which indexes every part.

## Data & Formats

### Directory layout

```
<per-user config dir>/            # global scope, always loaded
  agents.yaml                     # global overrides
  models.yml                      # optional static / custom provider declarations
  secrets.yaml                    # tool-server environment secrets (optional)
  project_settings.yaml           # machine-written provider/model discovery snapshot
  tools/                          # global custom tool plugins

<per-user data dir>/              # NOT configuration
  setup/state.json                # machine-setup record
  <credential store>              # provider credentials
  copilot-gateway/                # staged gateway credentials, one dir per workspace
    <workspace identifier>/       # never inside the workspace (REQ-PROVIDER-063)

<workspace>/.rotaris/             # workspace scope, higher precedence
  agents.yaml                     # slots, roles, runtime, sections
  models.yml                      # optional static / custom provider declarations
  secrets.yaml                    # tool-server environment secrets (optional)
  <workspace identifier>          # stable, human-readable, travels with the workspace (REQ-SESSION-197)
  plugins/                        # workspace plugins (inventory source; no extension fixed — REQ-TOOLS-161)
  tools/                          # workspace custom tool plugins
  worktrees/                      # per-session isolated checkouts

<workspace>/.mcp.json             # third-party tool-server discovery (locations per REQ-MCP-017)
<workspace>/AGENTS.md             # instruction file (inventory source)
<workspace>/AGENTS.override.md    # instruction file (inventory source)
<user-level>/mcp.json             # third-party tool-server discovery (locations per REQ-MCP-017)
```

The two discovery paths appear above only so the layout is complete. Their per-platform spellings, and the condition under which the user-level one is skipped, are REQ-MCP-017's and are not restated here (REQ-CONFIG-008, REQ-CONFIG-009).

Both per-user roots above — the configuration one and the data one — are the per-user location REQ-STARTUP-145 fixes: local to this machine, never replicated to another machine or to another copy of the user's profile. This domain names no other per-user location and states no second rule for one (REQ-CONFIG-001).

Everything in the layout above is a **file**, and that is deliberate: REQ-CONFIG-477 states the boundary and the grounds that reach it. Session records, post-run improvement artifacts and requirement delivery records are **not** in the layout because they are no longer directories in the workspace (REQ-CONFIG-010, REQ-CONFIG-192); they are held in the store the application keeps for the workspace, and no key of this domain names a location for them.

### Primary configuration document

`agents.yaml` is a YAML mapping. Recognized top-level keys, by merge class:

| Class | Keys |
|---|---|
| Replace-if-not-null | `default_persona`, `default_summary_model`(+`_thinking`), `improvement_collector_model`(+`_thinking`), `gatekeeper_model`(+`_thinking`), `small_model`(+`_thinking`), `medium_model`(+`_thinking`), `large_model`(+`_thinking`), `fallback_model`(+`_thinking`), `worktree_storage_subpath`, `inject_agents_md` |
| Named-entry | `personas`, `models`, `mcp_servers`, `unavailable_models` |
| Section | `runtime`, `verifier`, `compressor`, `circuit_breaker`, `transcript`, `display`, `initialization`, `project_init`, `requirements`, `skills`, `hooks`, `checkpoints`, `integration` |
| Computed (never file-sourced) | `workspace_root`, `metadata_workspace_root`, `mcp_server_sources`, `resolved_persona_model_tiers` |
| Outside the layered model | `rotaris.delegation_strategy` — a workspace-only, desktop-only key read by a separate parse of the same file, with **no global equivalent, no merge semantics and no schema validation**; accepted values `orchestrator`, `swarm`, `single`, anything else leaves the default in place |

`models.yml` is a YAML mapping whose only consumed key is `models:`.

### Discovery snapshot document

```yaml
version: 1                         # only 1 accepted
providers:
  <provider id>:
    id: <string>
    display_name: <string>         # required
    family: <string|null>
    base_url: <string|null>
    authenticated: <bool>          # required; false ⇒ contributes nothing
    discovered_at: <ISO-8601 UTC>  # required
    default_summary_model: <string|null>
    large_model: <string|null>
    medium_model: <string|null>
    small_model: <string|null>
    fallback_model: <string|null>
    models:
      - id: <string>               # required, unique within the provider
        display_name: <string|null>
        capabilities: {…}
        limits: {…}
        pricing: {<name>: <decimal string>}   # accepted amendment 2026-09-23, OQ-21
        discovered_at: <ISO-8601 UTC>   # required
```

Unknown keys are forbidden at every level. Written with insertion order preserved, mode `0644`, atomically, after a secret scan.

### Secrets document

```yaml
<tool server name>:
  <ENV_VAR_NAME>: <value>
```

Merged per key within a server across scopes; unreadable or malformed content yields no secrets, silently. Written atomically and left at mode `0600`, or at the equivalent explicit owner-only protection on a platform with no POSIX mode — the one file in the layout above protected as a credential store rather than as configuration (REQ-CONFIG-216).

### Third-party tool-server discovery document

Not restated here. The discovery locations are REQ-MCP-017's and the document's shape, accepted keys and parsing are REQ-MCP-018 through REQ-MCP-024 and REQ-MCP-027's; this document holds no copy of any of them (REQ-CONFIG-008).

What this domain publishes about a discovered entry: the source tags `discovered-project` and `discovered-user`, and the per-server provenance values `yaml`, `discovered-project`, `discovered-user`, `default` (REQ-CONFIG-222).

### Vocabularies

| Concept | Exact accepted values |
|---|---|
| Reasoning level (slot/model) | `auto`, `low`, `medium`, `high`, `max` |
| Reasoning level (role) | `default`, `provider_default`, `auto`, `low`, `medium`, `high`, `max` |
| Effort forwarded unchanged | `low`, `medium`, `high`, `xhigh` |
| Model tier alias | `small_model`, `medium_model`, `large_model` |
| Permission mode | not fixed here — REQ-TOOLS-041, ordered by REQ-TOOLS-047, cited by REQ-CONFIG-122 and REQ-CONFIG-324 |
| Non-interactive approval policy | not fixed here — REQ-TOOLS-065, cited by REQ-CONFIG-125 |
| Run-start mode | `auto`, `plan` (REQ-CONFIG-476) |
| Confinement mode | not fixed here — REQ-SANDBOX-048, cited by REQ-CONFIG-127 |
| Egress disposition | not fixed here — REQ-SANDBOX-001, cited by REQ-CONFIG-128 |
| Tool-server transport | not fixed here — REQ-MCP-001, cited by REQ-CONFIG-176 |
| Hook event | not fixed here — REQ-HOOKS-001, cited by REQ-CONFIG-157 |
| Hook scope stamp | `default`, `global`, `workspace` (REQ-HOOKS-014) |
| Check severity / role | `blocking`, `advisory` / `test`, `typecheck`, `lint`, `other` |
| Skill load mode | `off`, `name-only`, `user-invocable-only`, `on` |
| Skill invocation mode | `default`, `manual-only`, `auto-only` |
| Delegation strategy | `orchestrator`, `swarm`, `single` |
| Requirement source type | `reqtocode`, `markdown`, `yaml`, `json` |
| Requirement priority | `critical`, `high`, `normal`, `low`, `none` |
| Requirement refresh trigger | `commit`, `merge`, `source-edit`, `branch-switch`, `test-run`, `run-completion`, `worktree-integration`, `manual` |
| Evidence obligation | `required`, `optional`, `not-applicable` |
| Human escalation trigger | `contradictory-requirements`, `unclear-scope`, `competing-requirements`, `breaking-change`, `unclear-superseding`, `risky-migration`, `architectural-decision` |
| Board sort / grouping | `priority`, `id`, `state`, `health`, `epic` / `state`, `epic`, `source` |
| Tool-server health | `unknown`, `checking`, `healthy`, `unreachable` |
| Provider status | not fixed here — REQ-NOTIFY-200, cited by REQ-CONFIG-368 |
| Provider connection mode | `local-sdk`, `rotaris-cloud`, `direct`, `custom` |
| Initialization classification | `code`, `non-code` |
| Role field origin (Scope column) | `workspace`, `global`, `discovered`, `default` |
| Unavailable-model reason code | `not-entitled`, `deprecated`, `retired`, `region-restricted`, `quota-exceeded`, `unsupported`, `unknown` |
| Settings category identifiers | `models`, `personas`, `runtime`, `interface`, `display`, `skills`, `instructions`, `hooks`, `mcp`, `plugins`, `tools`, `project`, `about` |
| Reserved synthetic model prefixes | `__startup_slot__:`, `__persona__:` |
| Reserved operation identity | the registration pseudo-provider id used to serialize endpoint registration |

### Settings surface event shapes

| Event | Payload | Meaning |
|---|---|---|
| save requested | — | commit the pending workspace configuration |
| discard requested | — | reload the workspace configuration from disk |
| agent pop-out changed | bool | immediate desktop preference |
| terminal pop-out changed | bool | immediate desktop preference |
| worktree cleanup prompt changed | bool | immediate desktop preference |
| auto-collapse tool outputs changed | bool | immediate preference + live transcript re-render |
| group tool calls changed | bool | immediate preference + live transcript re-render |
| panel sizes reset requested | — | host owns the stored sizes and the confirmation |
| active category changed | string | persist the category preference |
| project initialization requested | — | host opens the initialization flow |
| workspace hook review requested | — | host opens the hook trust review |
| cloud credit refresh requested | — | host refreshes the account balance |
| machine setup repair requested | — | host re-probes machine tools |
