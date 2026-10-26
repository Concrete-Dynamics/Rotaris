# Command Sandboxing and Network Egress Policy — Configuration fields (workspace/global YAML)

Part 5 of 6 of [domain 10](../10-sandbox-network-egress.md), which indexes every part.

## Data & Formats

### Configuration fields (workspace/global YAML)

| Key | Type | Default | Values / constraints |
| --- | --- | --- | --- |
| `runtime.network_egress_policy` | string | `ask` | `allow` \| `ask` \| `deny`; case-insensitive; unknown rejected by name |
| `runtime.network_allowed_hosts` | list[string] | `[]` | host patterns; trimmed+lowercased; blanks dropped |
| `runtime.network_denied_hosts` | list[string] | `[]` | host patterns; same normalization |
| `runtime.sandbox_mode` | string | `off` | `off` \| `workspace-write` \| `read-only`; YAML boolean false reads as `off` |
| `runtime.sandbox_writable_roots` | list[string] | `[]` | absolute paths only; POSIX and Windows spellings accepted |
| `runtime.sandbox_allow_network` | bool | `false` | meaningful only when sandbox on |
| `runtime.allow_unsandboxed_autonomous` | bool | `false` | per-workspace opt-in |
| `runtime.permission_mode` | string | not restated — REQ-TOOLS-046 | vocabulary not restated — REQ-TOOLS-041 |
| `runtime.headless_approval_policy` | string | not restated — REQ-TOOLS-065 | values, default and the reading of an unknown value are REQ-TOOLS-065's (REQ-SANDBOX-053) |
| `runtime.approval_timeout_seconds` | not restated — REQ-CONFIG-126 | not restated — REQ-CONFIG-126 | `0` = wait without limit (REQ-SANDBOX-053) |
| `runtime.tool_call_timeout` | number | `30` | fetch default timeout when run-wired (REQ-CONFIG-115) |

Workspace config lives at `<workspace>/.rotaris/agents.yaml` and overrides the global config per field.

### Host pattern grammar

`pattern := exact-host | "*." host` — a single leading `*.` and nothing else; comparison by whole label; the wildcard stands for at least one leading label and does not include the bare name itself; any other use of `*` is a configuration error.

### Fetch result shape

Fields: `url` (requested), `final_url`, `status_code` (null on refusal), `content_type`, `truncated` (bool), `failure_kind`, `timeout_seconds`, `error_class`, `detail`.

`failure_kind` vocabulary (fetch): not restated here — REQ-TOOLS-092 (REQ-SANDBOX-025). What this domain adds is the `error_class` each kind carries: egress refusals carry `error_class: NetworkEgressDenied` (REQ-SANDBOX-026); the redirect-budget failure carries `error_class: TooManyRedirects` (REQ-SANDBOX-024); a malformed request carries `error_class: InvalidFetchRequest` (REQ-SANDBOX-020).

Fetch timeout precedence (REQ-SANDBOX-021), highest first: the call's `timeout` parameter; the owning run's `runtime.tool_call_timeout` (30 s); the built-in 10.0 s, reachable only with no owning run. `timeout: 0` means no time limit.

Model-facing rendering: failure = error header + `[fetch_diagnostic]` JSON block (sorted keys, nulls omitted) + optional `[fetch_output]`; success = `url:` / `final_url:` / `status_code:` / `content_type:` / `truncated:` header lines + body.

### Terminal observation additions

`failure_kind` vocabulary (terminal): `timeout`, `invalid_request`, `execution_error`, `sandbox_unavailable`. Sandbox refusal observation: exit code `126`, outcome kind `sandbox_unavailable`, severity `error`. Sandbox-launcher output prefixes used for relabeling: `bwrap:`, `sandbox-exec:`, `sandbox_apply:`; the prefix test spans standard output and standard error together (REQ-SANDBOX-085).

### Network-reaching command pattern catalogue

Not restated here. The catalogue of leading-token prefixes, and the segmentation and token-matching rules that apply it, are REQ-TOOLS-094's; this document holds no copy of them (REQ-SANDBOX-043).

### Permission rule identifiers (observable in refusals and audit)

Format `{mode}:{rule-name}`. Known ids in this domain: `restricted:fetch-remote-host`, `restricted:fetch-local-host`, `ask:fetch-remote-host`, `ask:fetch-local-host`, `restricted:network-command`, `ask:network-command`, `{mode}:read-only-tool`; mode-default decisions appear as `preset:{mode}`.

### Rendered OS confinement invocations

- macOS: `sandbox-exec -p '<profile>' /bin/sh -c '<command>'`, where the profile is default-deny, allows exec/fork/sysctl-read/signal, allows whole-filesystem reads, allows writes to the temp subpaths and device nodes listed in REQ-SANDBOX-075 plus one allowance per writable root, then denies each carve-out (after all allows), then allows or denies network wholesale.
- Linux: `bwrap --die-with-parent --ro-bind / / --dev /dev --proc /proc --tmpfs /tmp [--bind <root> <root> …] [carve-outs] [--unshare-net] -- /bin/sh -c '<command>'`, with carve-outs rendered per REQ-SANDBOX-077 (`--ro-bind-try <p> <p>` when present; `--tmpfs <p>` + `--remount-ro <p>` when absent; nothing when outside writable roots).
- Availability trials: `sandbox-exec -p "(version 1)(allow default)" /usr/bin/true` (macOS); on Linux, the product's own read-only-rooted rendering with the network namespace unshared, ending in `-- /bin/sh -c 'true'`, the same final tokens every rendered session invocation uses (REQ-SANDBOX-070, REQ-SANDBOX-079). Trial timeout 5.0 s, a hard bound with no retry within a process.

### Persistence and event shapes

- Session resumable state: keys `sandboxed` (bool, default false), `sandbox_backend` (string, default ""). Older states without the keys read as unsandboxed. This document names no location for it (REQ-SESSION-001).
- Run-start stream event: includes `sandboxed` (bool, availability verdict) and `permission_mode` (the effective mode after tightening, REQ-SANDBOX-110).
- Diagnostics timeline event on downgrade: name `permission_mode_downgraded`, actor `permissions`, metadata `requested_mode`, `effective_mode`.
- Diagnostics timeline event on a mid-session mode change: name `permission_mode_changed`, actor `permissions`, metadata `requested_mode`, `effective_mode`, `previous_mode`, `source`, `skipped_personas`.
- Permission audit (REQ-TOOLS-078, REQ-SESSION-137): entries name the deciding rule id. A mid-session mode change appends an entry with `event: permission_mode_change` plus `timestamp`, `session_id`, `agent_id`, `requested_mode`, `effective_mode`, `previous_mode`, `source`, `reason`, `skipped_personas` (list of strings, empty when no persona pin was left standing).
- Exit codes: a sandbox-refused command's observation reports exit code 126 — a child process's status inside a tool observation, not this product's own.
- Run refused for unavailable confinement: a single terminal result entry with status `error` on the run's event stream, carrying the availability reason and remediation (REQ-SANDBOX-126); nothing precedes or follows it.
