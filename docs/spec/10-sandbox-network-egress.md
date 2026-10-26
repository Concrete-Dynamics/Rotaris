---
reference: ROTARIS-CRW-001
domain: sandbox-network-egress
date: 2026-08-29
status: approved (Specification Gate closed 2026-08-31; amendments land as dated rounds in resolutions/)
---

# Command Sandboxing and Network Egress Policy

## Overview

The product gates outbound network access and confines shell command execution. Per-workspace configuration controls three cooperating surfaces: a per-host egress policy applied to the built-in URL-fetch tool (allow/ask/deny with allow and deny host lists), permission-layer gating of network-reaching terminal commands, and an operating-system confinement layer — inactive unless the workspace turns it on — that restricts terminal commands to a declared set of writable paths and carries a single on/off switch for network access. Every ambiguous or failing path resolves closed: an unclassifiable host is denied, confinement that cannot be proven working refuses to run commands rather than running them unconfined, and a permissive mode requested where no one can answer a prompt is tightened unless confinement is active or the workspace has explicitly opted out of that tightening. Confinement is available on two host operating systems and on no others, which is a closed set; on a host outside it the product says plainly, on both the settings surface and the launch surface, that nothing an agent runs there is confined.

## Parts

Since 2026-10-26 this domain's requirements, data and formats and open questions are in [`10-sandbox-network-egress/`](10-sandbox-network-egress/), one
file per section or run of sections, moved there verbatim and in order so that one part loads without the rest
([the document budget](../README.md#the-document-budget)). Every identifier and every anchor kept its text; a
link to one now names its part.

| Part | Sections | Requirements it defines |
|---|---|---|
| [01](10-sandbox-network-egress/01-requirements.md) | Requirements; Egress configuration surface; Host identity normalization; Host pattern grammar and matching; Egress classification; Local vs. remote classification; Fetch tool — request surface and defaults; Fetch tool — egress enforcement; Permission-layer gating of network access | REQ-SANDBOX-001 – REQ-SANDBOX-047 (47) |
| [02](10-sandbox-network-egress/02-sandbox-configuration-surface.md) | Sandbox configuration surface; Confinement model; Sandbox availability; Rendered OS confinement (observable invocations) | REQ-SANDBOX-048 – REQ-SANDBOX-128 (34) |
| [03](10-sandbox-network-egress/03-terminal-tool-enforcement.md) | Terminal-tool enforcement; Session binding and launch; Downgrade of unattended permissive runs; Persistence, events, and audit | REQ-SANDBOX-080 – REQ-SANDBOX-126 (34) |
| [04](10-sandbox-network-egress/04-desktop-settings-and-launch-surfaces.md) | Desktop settings and launch surfaces; Contracts with neighboring subsystems | REQ-SANDBOX-113 – REQ-SANDBOX-125 (15) |
| [05](10-sandbox-network-egress/05-data-formats.md) | Data & Formats; Configuration fields (workspace/global YAML); Host pattern grammar; Fetch result shape; Terminal observation additions; Network-reaching command pattern catalogue; Permission rule identifiers (observable in refusals and audit); Rendered OS confinement invocations; Persistence and event shapes | — |
| [06](10-sandbox-network-egress/06-open-questions.md) | Open Questions | — |
