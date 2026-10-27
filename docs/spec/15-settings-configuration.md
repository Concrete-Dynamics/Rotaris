---
reference: ROTARIS-CRW-001
domain: settings-configuration
date: 2026-08-29
status: approved (Specification Gate closed 2026-08-31; amendments land as dated rounds in resolutions/)
---

# Settings and Configuration

## Overview

The product is configured by optional YAML files kept in two directory scopes — a per-user global directory and a per-workspace `.rotaris/` directory — folded together with built-in defaults, auto-discovered third-party tool-server declarations, and a machine-written provider/model discovery snapshot into a single validated configuration on every load. Precedence is fixed and total, the overlay is at most one level deep, and lists never append. Absence of every configuration file is a normal state that loads on defaults alone, while a malformed primary file aborts the load with a message naming the file. The desktop settings screen edits a narrow, enumerable subset of these keys and writes them back atomically; a save is followed by an immediate reload so the change is observable without a restart, while every key outside that subset takes effect at the next load. The product is one desktop application: it is configured from that screen and from the two scopes' files, and from nowhere else — there is no command-line invocation, no flag, no subcommand and no text-mode surface through which a user configures or drives it. The settings screen distinguishes deferred edits (committed by an explicit Save, revertible by Discard) from immediately-committed preferences, and demands confirmation before changes that widen what an agent may reach.

## Parts

Since 2026-10-26 this domain's requirements, data and formats and open questions are in [`15-settings-configuration/`](15-settings-configuration/), one
file per section or run of sections, moved there verbatim and in order so that one part loads without the rest
([the document budget](../README.md#the-document-budget)). Every identifier and every anchor kept its text; a
link to one now names its part.

| Part | Sections | Requirements it defines |
|---|---|---|
| [01](15-settings-configuration/01-requirements.md) | Requirements; Configuration sources, scopes and locations; File format and parse-time error semantics; First-run bootstrap; Layering and precedence; Merge disciplines; Null, absent and empty semantics | REQ-CONFIG-001 – REQ-CONFIG-057 (60) |
| [02](15-settings-configuration/02-legacy-migration.md) | Legacy migration; Top-level keys and model slots; Tier aliases and reasoning-effort synthesis; Model entries; Role (persona) entries | REQ-CONFIG-058 – REQ-CONFIG-110 (53) |
| [03](15-settings-configuration/03-runtime-policy.md) | Runtime policy; Compression and circuit breaker; Verification suite | REQ-CONFIG-111 – REQ-CONFIG-470 (45) |
| [04](15-settings-configuration/04-lifecycle-hooks.md) | Lifecycle hooks; Checkpoints, initialization and project classification; Portable skills; Display and transcript settings; Tool-server (MCP) entries | REQ-CONFIG-148 – REQ-CONFIG-182 (37) |
| [05](15-settings-configuration/05-requirements-board-configuration.md) | Requirements-board configuration; Provider/model discovery snapshot; Snapshot read/write semantics; Secrets | REQ-CONFIG-183 – REQ-CONFIG-218 (36) |
| [06](15-settings-configuration/06-third-party-discovery-and-placeholder-expansion.md) | Third-party discovery and placeholder expansion; Validation and error reporting; Startup configuration validation and recovery | REQ-CONFIG-219 – REQ-CONFIG-247 (30) |
| [07](15-settings-configuration/07-write-back-what-each-surface-persists-and-where.md) | Write-back: what each surface persists and where; When a change takes effect; Settings screen: structure and navigation; Settings screen: save, discard and dirty state; Settings screen: validated list editors | REQ-CONFIG-248 – REQ-CONFIG-297 (51) |
| [08](15-settings-configuration/08-settings-screen-security-policy-controls-and.md) | Settings screen: security policy controls and confirmations; Settings screen: confinement availability verdict; Settings screen: runtime policy controls; Settings screen: model slots and per-role overrides | REQ-CONFIG-298 – REQ-CONFIG-341 (45) |
| [09](15-settings-configuration/09-settings-screen-skills-tool-servers-and.md) | Settings screen: skills, tool servers and inventories; Settings screen: lifecycle hooks surface; Settings screen: provider management; Settings screen: project initialization and machine setup | REQ-CONFIG-342 – REQ-CONFIG-398 (58) |
| [10](15-settings-configuration/10-immediately-applied-preferences-outside-save.md) | Immediately-applied preferences (outside Save); Released-run permissions and the answer-wait budget; Persistence destinations and reload discipline; The shared model picker; Presentation and accessibility rules; The scoped per-field write path | REQ-CONFIG-399 – REQ-CONFIG-447 (50) |
| [11](15-settings-configuration/11-cross-cutting-invariants.md) | Cross-cutting invariants | REQ-CONFIG-448 – REQ-CONFIG-460 (13) |
| [12](15-settings-configuration/12-data-formats.md) | Data & Formats; Directory layout; Primary configuration document; Discovery snapshot document; Secrets document; Third-party tool-server discovery document; Vocabularies; Settings surface event shapes | — |
| [13](15-settings-configuration/13-open-questions.md) | Open Questions | — |
