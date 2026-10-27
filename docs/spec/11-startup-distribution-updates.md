---
reference: ROTARIS-CRW-001
domain: startup-distribution-updates
date: 2026-08-29
status: approved (Specification Gate closed 2026-08-31; amendments land as dated rounds in resolutions/)
---

# Application Startup, Distribution, and Updates

## Overview

Rotaris ships as a standalone desktop application on three platforms — Windows, macOS, and Linux — every artifact of a release carrying that release's single product version. It is a graphical application only: it exposes no command-line interface, no subcommands, no flags and no text-mode interface, and every capability it offers is reached from the desktop. At most one instance of it runs per user account: launching it again surfaces the instance that is already running instead of starting a rival, and the several workspaces and several windows a user works in are windows of that one instance. On first launch of a standalone build, the desktop paints immediately, then runs a visible, cancellable, resumable machine-setup pass that probes for required tools (Git, ripgrep, Node-provided package runners), provisions pinned tool versions into a per-user managed directory, and warms MCP package caches — when a tool is unavailable only the features that need it lose capability, and the application itself is never held back. The single-file portable artifact may prepare itself once for launching and start from that preparation afterwards; the preparation is held in per-user machine-local storage and never beside the artifact, so the artifact still runs from read-only and removable media, and only the run that prepares is exempt from the first-paint budget — a run that could prepare no copy at all is exempt on the same terms and is the one preparation outcome the product tells the user about. Opening a workspace held on storage another machine can reach, or that a synchronisation agent replicates, is warned about and never refused. A supported standalone desktop build performs exactly one silent update check per launch, issued against the product's public release feed once the window is visible; a newer release is offered through a dismissible, non-blocking banner that can download, verify the release's checksum manifest against a signing key the application itself carries and the downloaded asset against that manifest, and apply the update to the artifact the launch started from, using a strategy appropriate to the installation flavour. The artifacts themselves carry no code signature and the platform's own first-launch trust prompts are unchanged by that; what the signed manifest adds is who published a release, which the checksums alone never established. An opt-in diagnostics flag records a bounded, content-free UI trace to disk.

## Parts

Since 2026-10-26 this domain's requirements, data and formats and open questions are in [`11-startup-distribution-updates/`](11-startup-distribution-updates/), one
file per section or run of sections, moved there verbatim and in order so that one part loads without the rest
([the document budget](../README.md#the-document-budget)). Every identifier and every anchor kept its text; a
link to one now names its part.

| Part | Sections | Requirements it defines |
|---|---|---|
| [01](11-startup-distribution-updates/01-requirements.md) | Requirements; Product identity, entry points, and version reporting; Standalone build command; Windows installer and portable executable; macOS disk image; Linux AppImage; Platform scope | REQ-STARTUP-001 – REQ-STARTUP-026 (29) |
| [02](11-startup-distribution-updates/02-release-pipeline.md) | Release pipeline | REQ-STARTUP-027 – REQ-STARTUP-156 (15) |
| [03](11-startup-distribution-updates/03-single-running-instance.md) | Single running instance; Desktop launch and startup sequence; First-launch workspace onboarding | REQ-STARTUP-161 – REQ-STARTUP-054 (20) |
| [04](11-startup-distribution-updates/04-workspace-storage.md) | Workspace storage; Demo mode; Machine-setup manifest and platform keys; Setup planning and probing; Setup execution: state, locking, resume, cancel, failure; Setup downloads, verification, extraction; Managed tool environment; Setup dialog (desktop) | REQ-STARTUP-166 – REQ-STARTUP-097 (44) |
| [05](11-startup-distribution-updates/05-re-running-setup-after-first-launch.md) | Re-running setup after first launch; Settings surface for machine setup; Update check: eligibility, endpoint, policy; Update notification UI | REQ-STARTUP-098 – REQ-STARTUP-121 (26) |
| [06](11-startup-distribution-updates/06-update-download-verification-and-install.md) | Update download, verification, and install strategies; Background download, the pending update, and the next-start apply | REQ-STARTUP-122 – REQ-STARTUP-181 (20) |
| [07](11-startup-distribution-updates/07-opt-in-diagnostics.md) | Opt-in diagnostics; Third-party notices; Network-activity disclosure; Persistence, environment, and exit codes | REQ-STARTUP-129 – REQ-STARTUP-149 (23) |
| [08](11-startup-distribution-updates/08-cross-cutting-invariants.md) | Cross-cutting invariants | REQ-STARTUP-150 – REQ-STARTUP-155 (4) |
| [09](11-startup-distribution-updates/09-data-formats.md) | Data & Formats | — |
| [10](11-startup-distribution-updates/10-open-questions.md) | Open Questions | — |
