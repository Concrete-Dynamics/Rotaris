---
reference: ROTARIS-CRW-001
domain: desktop-shell-windows
date: 2026-08-29
status: approved (Specification Gate closed 2026-08-31; amendments land as dated rounds in resolutions/)
---

# Desktop Shell, Navigation, and Window Management

## Overview

Rotaris presents a single main desktop window containing seven primary views selected from a left-hand navigation rail, framed by a title bar (brand, workspace, and session status) and a bottom status strip (workspace, branch, safety, cost, and cloud indicators). The shell owns global keyboard shortcuts and a command palette, responsive compact layouts with overlay drawers, user-resizable and persistent pane layouts, auxiliary per-persona agent windows, a terminal pop-out window with an interactive character-grid terminal, transient and persistent notification surfaces, theming with accessibility floors, and guarded window-close / workspace-switch / session-switch flows. Preferences persist in a single per-user store; all shell behavior below is stated as externally observable requirements.

## Parts

Since 2026-10-26 this domain's requirements, data and formats and open questions are in [`12-desktop-shell-windows/`](12-desktop-shell-windows/), one
file per section or run of sections, moved there verbatim and in order so that one part loads without the rest
([the document budget](../README.md#the-document-budget)). Every identifier and every anchor kept its text; a
link to one now names its part.

| Part | Sections | Requirements it defines |
|---|---|---|
| [01](12-desktop-shell-windows/01-requirements.md) | Requirements; Application entry, demo mode, and preference store; Startup sequencing; Workspace selection and replacement; Main window structure; Navigation rail | REQ-SHELL-001 – REQ-SHELL-032 (35) |
| [02](12-desktop-shell-windows/02-title-bar.md) | Title bar; Status strip; Commands, shortcuts, palette, and keyboard help; Compact layout and overlay drawers; Resizable panes: dividers, persistence, reset | REQ-SHELL-033 – REQ-SHELL-071 (40) |
| [03](12-desktop-shell-windows/03-agent-persona-pop-out-windows.md) | Agent (persona) pop-out windows; Terminal pop-out window; Terminal tab header, controls, and messaging; Terminal output grid; Terminal stream state, delivery, and audit | REQ-SHELL-072 – REQ-SHELL-166 (42) |
| [04](12-desktop-shell-windows/04-transient-and-persistent-feedback-surfaces.md) | Transient and persistent feedback surfaces; Window close, quit protection, shutdown; Sessions: new, browse, focus; Theming; Motion and reduced motion; About & Legal | REQ-SHELL-112 – REQ-SHELL-143 (33) |
| [05](12-desktop-shell-windows/05-shell-accessibility-contract.md) | Shell accessibility contract; Update responsiveness; Tab strips and vertical navigation lists; Miscellaneous shell behaviors and edge cases | REQ-SHELL-144 – REQ-SHELL-168 (19) |
| [06](12-desktop-shell-windows/06-data-formats.md) | Data & Formats; Application entry; Diagnostics capture vocabulary; Per-user preference store; Per-workspace prompt storage; Terminal stream event model; Permission audit entries for user terminal actions; Bundled assets read by the shell; Legal document URL set | — |
| [07](12-desktop-shell-windows/07-open-questions.md) | Open Questions | — |
