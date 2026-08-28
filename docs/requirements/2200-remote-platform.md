---
req-id: [SWR-2200, SWR-2201, SWR-2202, SWR-2203, SWR-2204, SWR-2205, SWR-2206, SWR-2207, SWR-2208, SWR-2209, SWR-2210, SWR-2211, SWR-2212, SWR-2213, SWR-2214, SWR-2215]
status: draft
trace: required
test: required
title: "Remote Access & Support Platform"
---

# 2200-remote-platform spec

## SWR-2200 — Remote Access & Support Platform
trace: optional
test: optional

Remote/web access (PWA) and feedback/support ticket integration.

## SWR-2201 — Web application surface
legacy-id: REQ-20260515-WEB-PDA-001
date: 2026-05-15
source: docs/requirement-log/unresolved/requirements-20260515-web-pda-platform.md

The system SHOULD provide a web application accessible through a browser that exposes at minimum the following capabilities: - Submit prompts / tasks to an active or paused session. - View the current session state, active agent, and ongoing tool calls. - Browse the full chat transcript of the current and past sessions. - Navigate between sessions within the

## SWR-2202 — Streaming interaction
legacy-id: REQ-20260515-WEB-PDA-002
date: 2026-05-15
source: docs/requirement-log/unresolved/requirements-20260515-web-pda-platform.md

Responses from the agent, tool call results, and session state transitions MUST stream to the web client in near-real-time so the user sees live progress rather than waiting for the entire task to complete. Implementation options to consider: Server-Sent Events (SSE), WebSocket, or HTTP streaming. The choice depends on the chosen backend architecture.

## SWR-2203 — Session continuation (remote resume)
legacy-id: REQ-20260515-WEB-PDA-003
date: 2026-05-15
source: docs/requirement-log/unresolved/requirements-20260515-web-pda-platform.md

Users MUST be able to: - Discover incomplete or paused sessions from the web interface. - Resume a paused session by adding new prompts or continuing from the current todo state. - View accumulated artifacts and transcript from the resumed session seamlessly. The session persistence mechanism (JSON snapshots, token state, todo list) MUST be the same source r

## SWR-2204 — PWA support
legacy-id: REQ-20260515-WEB-PDA-004
date: 2026-05-15
source: docs/requirement-log/unresolved/requirements-20260515-web-pda-platform.md

The web application MUST qualify as a Progressive Web App with the following capabilities: - Service Worker for offline caching of static assets and recently viewed session data. - Web App Manifest allowing installation to the device home screen (mobile) or desktop. - Background sync where applicable so that submitted prompts are delivered when connectivity

## SWR-2205 — Push notifications
legacy-id: REQ-20260515-WEB-PDA-005
date: 2026-05-15
source: docs/requirement-log/unresolved/requirements-20260515-web-pda-platform.md

The web application SHOULD deliver push notifications to the user's device when: - A running task reaches a terminal state (success, failure, needs user input). - An agent encounters an error or requires clarification. - A delegated child task completes. Notification delivery MUST respect user consent and browser-level permissions.

## SWR-2206 — Authentication & authorization
legacy-id: REQ-20260515-WEB-PDA-006
date: 2026-05-15
source: docs/requirement-log/unresolved/requirements-20260515-web-pda-platform.md

Any remote access surface MUST protect sessions and workspace data with authentication. Minimum expectations: - User login via a secure OAuth flow (leveraging existing auth infrastructure where possible, e.g. the existing GitHub/Copilot auth modules). - Per-session or per-workspace access controls - users only see and can interact with sessions they own or h

## SWR-2207 — Backend architecture considerations (exploratory)
legacy-id: REQ-20260515-WEB-PDA-007
date: 2026-05-15
source: docs/requirement-log/unresolved/requirements-20260515-web-pda-platform.md

How the web layer integrates with the existing single-process, asyncio-based architecture is an open design question. Possible approaches include: 1. **Embedded HTTP server** - add an optional HTTP/websocket layer within the existing process (e.g. via `uvicorn` + `fastapi`), serving the web app alongside the existing runtime. 2. **Standalone companion servic

## SWR-2208 — Hardcoded endpoint** — The feedback POST endpoint URL is a module-level constant in a new `src/rotaris_core/feedback.py` module (e.g., `_FEEDBACK_ENDPOINT = \"https://feedback.geraet.ai/api/v1/tickets\"`). The timeout for the HTTP request is a separate hardcoded constant (e.g., `_FEEDBACK_TIMEOUT = 15` seconds). No part of the endpoint or timeout is user-configurable.
legacy-id: REQ-20260616-001
date: 2026-06-16
source: docs/requirement-log/unresolved/requirements-20260616-120000-feedback-support-tickets.md
priority: High



## SWR-2209 — FeedbackScreen modal** — A `FeedbackScreen` (`ModalScreen[None]`) provides a `TextArea` for the user's message, a `Switch` labelled \"Include session log (debug.log)\", a `Switch` labelled \"Include session metadata (persona, model, status)\", and a \"Send\" button. The screen is dismissed on Escape or after successful submission. The screen is defined in `tui/screens/feedback.py`.
legacy-id: REQ-20260616-002
date: 2026-06-16
source: docs/requirement-log/unresolved/requirements-20260616-120000-feedback-support-tickets.md
priority: High



## SWR-2210 — Command palette entry** — The command palette (`RotarisCommandPalette`) and `CommandPaletteCheatsheetScreen` include a \"Send feedback\" entry that opens `FeedbackScreen`. The entry is always present.
legacy-id: REQ-20260616-003
date: 2026-06-16
source: docs/requirement-log/unresolved/requirements-20260616-120000-feedback-support-tickets.md
priority: Medium



## SWR-2211 — Slash command** — A `/feedback` slash command is registered in `SlashCommandRegistry`. It opens `FeedbackScreen`.
legacy-id: REQ-20260616-004
date: 2026-06-16
source: docs/requirement-log/unresolved/requirements-20260616-120000-feedback-support-tickets.md
priority: Medium



## SWR-2212 — Payload structure** — The POST body is JSON with the following fields: `message` (string, the user's free-text), `app_version` (string, from `importlib.metadata`), `os` (string, `platform.platform()`), `python_version` (string), and, when opted in: `debug_log` (string, contents of `evidence/debug.log` truncated to 256 KiB) and `session_metadata` (object with `persona`, `model`, `execution_status`, `session_id`).
legacy-id: REQ-20260616-005
date: 2026-06-16
source: docs/requirement-log/unresolved/requirements-20260616-120000-feedback-support-tickets.md
priority: High



## SWR-2213 — Submission behaviour** — Submission runs via `asyncio.create_task` (fire-and-forget). On success (HTTP 2xx): toast \"Feedback sent. Thank you!\" and dismiss the screen. On HTTP error: toast with the status code and server body excerpt. On network/timeout error: toast \"Feedback submission failed: <reason>\". The user's message text is preserved in the form on failure so they can retry.
legacy-id: REQ-20260616-006
date: 2026-06-16
source: docs/requirement-log/unresolved/requirements-20260616-120000-feedback-support-tickets.md
priority: High



## SWR-2214 — Privacy and data minimization** — The `debug_log` attachment is NEVER sent unless the user explicitly checks the opt-in checkbox. Session metadata is NEVER sent unless the user explicitly checks its opt-in checkbox. The default state of both toggles is OFF. The user's message is always sent (it is the feedback content). The feature does NOT send API keys, environment variables, file contents, or any data outside the explicit payload fields.
legacy-id: REQ-20260616-007
date: 2026-06-16
source: docs/requirement-log/unresolved/requirements-20260616-120000-feedback-support-tickets.md
priority: High



## SWR-2215 — No active session handling** — When no session is active, the \"Include session log\" and \"Include session metadata\" toggles are disabled (greyed out) with a label indicating \"No active session\". The feedback form remains usable for general feedback.
legacy-id: REQ-20260616-008
date: 2026-06-16
source: docs/requirement-log/unresolved/requirements-20260616-120000-feedback-support-tickets.md
priority: Low



## History

Source documents were merged into this epic on 2026-07-18; the originals live in
git history under `docs/requirement-log/`.
