# EXEC slice — architecture proposals — 2.12 Secret redaction

Part 4 of 9 of [the exec proposal](../exec.md), which indexes every part.

### 2.12 Secret redaction

- **C-138 (hard).** One shared pass backs **seven** surfaces — approval prompt, audit log, event
  stream, application log files, user-visible error text, persisted documents, lifecycle-hook
  payloads — and none of them carries redaction rules of its own (REQ-TOOLS-171). One definition of
  the algorithm, the marker, the display mask and the value-prefix list.
- **C-139 (hard).** Four ordered layers with exact semantics: `key=value`/`key: value` with
  secret-looking keys; `--flag value` with secret-looking flags; the value after `Bearer`/`Basic`/
  `token` compared case-insensitively; and a value-shape sweep for `ghp_`, `ghs_`, `ghu_`, `gho_`,
  `sk-`, `sk_`, `iv1.`, `eyj`, recognized case-insensitively and only at a token boundary. In layers
  1–3 the replaced value spans exactly one value token: to the matching closing quote when quoted
  (quotes retained around the mask), otherwise to the first following whitespace or end of string
  (REQ-TOOLS-171).
- **C-140 (hard).** The key-name test is a fixed segmentation: strip a leading run of `-`, split on
  every run of non-alphanumeric characters, and match a **whole** segment case-insensitively against
  a closed sixteen-word list. `--api-key` and `GITHUB_TOKEN` are secret-looking; `keyboard_layout` and
  `--secretly-verbose` are not (REQ-TOOLS-172). When the key is secret-looking the **entire** value is
  masked, not merely the credential-shaped part.
- **C-141 (hard).** The mask is exactly `***`, identical on every surface, carrying no character of
  the value and no indication of its length; only the value is replaced, so program names, subcommands
  and flag names survive; the pass is idempotent; and the recognized set is complete, so a string
  carrying none of it reaches its destination unaltered (REQ-TOOLS-171).
- **C-142 (hard).** The **display mask** is a different function and the two are never substituted:
  ≤ 4 characters → `****`; longer → first 2 + `****` + last 2, so a rendering is always 4 or 8
  characters and never discloses length. It is the only rendering of a stored secret any interface
  shows (REQ-TOOLS-171).
- **C-143 (hard).** Redaction on events must hold "no matter how the event was assembled or which of
  its fields were set last", and `permission.decision` summaries are described as re-redacted on
  construction *and on assignment* (REQ-TOOLS-173, REQ-TOOLS-083, Data & Formats). This is an
  invariant on the type, not a discipline at call sites.

### 2.13 Extension points: plugins and MCP

- **C-144 (hard, and a stack conflict).** Custom tool plugins are `*.py` files under
  `<workspace>/.rotaris/plugins`, listed per persona under `custom_tools:`, each defining exactly one
  tool definition, loaded when that persona's agent is built, executing **inside the host process**
  with exactly the OS privileges that process holds and no confinement of their own
  (REQ-TOOLS-161, REQ-TOOLS-163, REQ-TOOLS-165, Data & Formats on-disk layout). A TypeScript/Node
  host cannot import a Python module into its own process. See ADR-EXEC-12 — **ESCALATE**.
- **C-145 (hard).** Discovery is not loading: a file's presence in the plugin folder grants nothing;
  the settings inventory must list every `*.py` file in that folder *and state in text, never by
  colour alone, whether it is loaded and by which personas* (REQ-TOOLS-161, REQ-TOOLS-165,
  REQ-SHELL-149).
- **C-146 (hard).** Duplicate registered plugin names after configuration resolution, and a plugin
  registering under a name the persona also declares under `tools:`, are **startup errors** — they
  are ambiguities about which tool a name means, not absences (REQ-TOOLS-162, REQ-TOOLS-002,
  REQ-TOOLS-164).
- **C-147 (hard).** Every plugin argument and return value must be expressible as JSON (or a declared
  schema type); plugin exceptions become structured tool errors with type and message to the model and
  stack traces to debug logs only; a plugin is built with and invoked under the same run-scoped
  context a built-in receives (REQ-TOOLS-163). This JSON constraint is also what licenses the compact
  JSON comparison of C-23.
- **C-148 (hard).** `tools:` never names an MCP server. Exactly one key grants a server
  (`mcp_servers`) and one narrows it (`mcp_tools`); no entry grants the whole surface; a server's own
  disabled-tools list applies on top and a denial always beats a grant (REQ-TOOLS-001,
  REQ-TOOLS-166).
- **C-149 (hard).** Grant matching accepts the original name or that name carrying one of three
  provider prefixes (`<server>_`, `mcp-<server>-`, `mcp__<server>__`), the unprefixed name always
  remaining a match. A grant naming a tool the server does not ship is logged once per process and
  never fails the run — a shipped surface is a runtime fact. A `mcp_tools` key naming a server absent
  from that persona's `mcp_servers` is a configuration-validation error — a static contradiction
  (REQ-TOOLS-168, REQ-TOOLS-169). Static typos fail; host facts warn.

### 2.14 Cross-cutting isolation and lifecycle

- **C-150 (hard).** Permission state never crosses a session or run boundary and nothing falls back
  from one to another when its own state is missing: an approval answered in one session never
  authorizes a call in another; one run's decisions never appear in another's audit trail; a mode
  change in one session never alters another's; a call that cannot be attributed to a run never
  borrows a live run's sandbox specification or egress configuration (REQ-TOOLS-176).
- **C-151 (hard).** Teardown ordering is specified: discarding a session's approval host cancels all
  waiting approvals (waiters resolve cancelled → deny); run or scheduler stop releases blocked calls
  the same way; discarding the session's mode override at run end prevents a resumed session
  inheriting a mid-run switch (REQ-TOOLS-177, REQ-TOOLS-075).
- **C-152 (hard).** Agents are constructed with **no** built-in run-termination tool; a run terminates
  when the agent produces a user-addressed message and requests no tool call in the same turn. The
  never-gated loop-control names of C-27 are retained only for personas or providers that still
  surface such a tool (REQ-TOOLS-180).
- **C-153 (hard).** The event envelope carries `schema_version`, `event`, ISO-8601 UTC `timestamp` and
  `session_id`, and consumers must ignore unknown fields (REQ-TOOLS-182). `session.start` carries
  `permission_mode` (effective) and `sandboxed` (verdict); `tool.start`/`tool.finish` carry redacted
  arguments clipped at 240 characters plus outcome and duration (REQ-TOOLS-181, REQ-TOOLS-173,
  REQ-SANDBOX-109, REQ-SANDBOX-110).

---
