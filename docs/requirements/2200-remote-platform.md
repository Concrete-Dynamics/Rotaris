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

Source documents merged into this epic (sections preserved verbatim; requirement tables migrated to the files above).

### Rotaris - Remote Session Access via Web Application (Progressive Web App) (2026-05-15)

Original: `docs/requirement-log/unresolved/requirements-20260515-web-pda-platform.md` — document status: Not Started

#### Description

Provide a web-based platform so users can monitor and continue rotaris-cli sessions remotely from mobile devices or desktop browsers. Users submit prompts, observe real-time streaming results, resume interrupted sessions, and receive push notifications - all through a Progressive Web App (PWA) that works offline and can be installed as a native-like app.

**Problem being solved:**

Currently all user interaction with Rotaris happens locally through a CLI or the desktop TUI. When the user is away from their machine they cannot:

- Submit new prompts or tasks.

- Observe what a running session is doing in real time.

- Resume an unfinished session from another device.

- Receive notifications when a long-running task completes or encounters an issue.

For mobile-first or on-the-go workflows this creates a gap between the powerful orchestration engine and the user's ability to interact with it.

**Current behaviour:**

- All UI is local: Textual TUI (console) or CLI.

- Sessions are persisted as JSON snapshots on the local filesystem.

- Token usage, tool calls, and transcript data are tracked per session.

- No network service or HTTP API surface exists.

**Design intent (future):**

This is planned for the future as a remote-access layer. The core idea: > A lightweight web application sits between the user and the Rotaris backend, enabling remote session management, real-time streaming of results, and PWA capabilities including push notifications, offline caching, and home-screen installation. The intent is exploratory / aspirational at this stage. Implementation depends on whether a suitable backend architecture emerges (either an optional embedded web server within the existing process, or a separate companion service).

#### Implementation Notes

**Requirements Document - Web App & PDA Platform:**

**Requirement ID:** REQ-20260515-WEB-PDA **Priority:** Future

**REQ-20260515-WEB-PDA-001 - Web application surface:**

The system SHOULD provide a web application accessible through a browser that exposes at minimum the following capabilities:

- Submit prompts / tasks to an active or paused session.

- View the current session state, active agent, and ongoing tool calls.

- Browse the full chat transcript of the current and past sessions.

- Navigate between sessions within the same workspace or project context.

**REQ-20260515-WEB-PDA-002 - Streaming interaction:**

Responses from the agent, tool call results, and session state transitions MUST stream to the web client in near-real-time so the user sees live progress rather than waiting for the entire task to complete. Implementation options to consider: Server-Sent Events (SSE), WebSocket, or HTTP streaming. The choice depends on the chosen backend architecture.

**REQ-20260515-WEB-PDA-003 - Session continuation (remote resume):**

Users MUST be able to:

- Discover incomplete or paused sessions from the web interface.

- Resume a paused session by adding new prompts or continuing from the current todo state.

- View accumulated artifacts and transcript from the resumed session seamlessly.

The session persistence mechanism (JSON snapshots, token state, todo list) MUST be the same source regardless of whether access is local (TUI/CLI) or remote (web).

**REQ-20260515-WEB-PDA-004 - PWA support:**

The web application MUST qualify as a Progressive Web App with the following capabilities:

- Service Worker for offline caching of static assets and recently viewed session data.

- Web App Manifest allowing installation to the device home screen (mobile) or desktop.

- Background sync where applicable so that submitted prompts are delivered when connectivity is restored.

- Responsive design usable on phones, tablets, and desktop screens.

**REQ-20260515-WEB-PDA-005 - Push notifications:**

The web application SHOULD deliver push notifications to the user's device when:

- A running task reaches a terminal state (success, failure, needs user input).

- An agent encounters an error or requires clarification.

- A delegated child task completes.

Notification delivery MUST respect user consent and browser-level permissions.

**REQ-20260515-WEB-PDA-006 - Authentication & authorization:**

Any remote access surface MUST protect sessions and workspace data with authentication. Minimum expectations:

- User login via a secure OAuth flow (leveraging existing auth infrastructure where possible, e.g. the existing GitHub/Copilot auth modules).

- Per-session or per-workspace access controls - users only see and can interact with sessions they own or have been granted access to.

- Tokens and API keys MUST never be transmitted in URLs or logged.

**REQ-20260515-WEB-PDA-007 - Backend architecture considerations (exploratory):**

How the web layer integrates with the existing single-process, asyncio-based architecture is an open design question. Possible approaches include:

1. **Embedded HTTP server** - add an optional HTTP/websocket layer within the existing process (e.g. via `uvicorn` + `fastapi`), serving the web app alongside the existing runtime.

2. **Standalone companion service** - a separate microservice that reads session data from disk and communicates with the LLM backend directly, decoupled from the core runtime.

3. **External proxy** - the web app talks to an external Rotaris gateway/service that handles session orchestration, used when running in cloud or hosted deployments.

Approach selection depends on deployment goals and effort assessment at the time of implementation.

**Non-Goals (for now):**

- Multi-tenant SaaS hosting - this requirement describes a capability of the Rotaris project itself, not a managed cloud product.

- Real-time collaborative editing - concurrent sessions from multiple users on the same task are out of scope.

#### Acceptance Criteria

All requirement rows are implemented or explicitly tracked according to status `Not Started`.

### Requirements Document (2026-06-16)

Original: `docs/requirement-log/unresolved/requirements-20260616-120000-feedback-support-tickets.md` — document status: Not Started

#### Summary

Users need a way to submit feedback or support tickets directly from within the Rotaris TUI without leaving the application. The feature provides a modal form with a free-text message field and opt-in checkboxes to attach the current session's diagnostic log (`debug.log`) and session metadata. The submission endpoint is a **hardcoded constant** in the Rotaris source code — all users and all organizations send feedback to the same Rotaris-owned endpoint. There is no per-company or per-user endpoint configuration.

This addresses the real user pain of encountering errors or having feedback and either (a) not reporting it at all, or (b) needing to manually locate and attach log files via external channels.

---

#### Context

### Problem being solved

Today, when users encounter unexpected behaviour, errors, or have feature feedback, they must leave the TUI, locate session logs under `.rotaris/sessions/<id>/evidence/debug.log`, and manually compose an email or ticket in a separate tool. This friction causes under-reporting of bugs and lost feedback.

### Current behaviour

- The TUI command palette (`RotarisCommandPalette` / `CommandPaletteCheatsheetScreen`) exposes entries for stop, pause, new session, theme switching, tool settings, compression settings, dev options, etc.
- Slash commands (`/stop`, `/theme`, `/model`, etc.) are handled by `SlashCommandRegistry` in `tui/widgets/slash_commands.py`.
- Modal screens exist for settings (e.g., `ToolResultSettingsScreen` uses `Switch` for toggles).
- Session diagnostics are written to `<session>/evidence/debug.log` via `runtime_logging.py` and `session/diagnostics.py`.
- There is no existing feedback, support ticket, or crash-reporting mechanism.

### What needs to change

1. A hardcoded feedback endpoint URL constant defined in a new `feedback.py` module under `src/rotaris_core/`.
2. A new `FeedbackScreen` (`ModalScreen`) accessible from the command palette and via `/feedback` slash command.
3. The feedback form collects: a free-text message, an opt-in checkbox to include the session debug log, and an opt-in checkbox to include session metadata.
4. On submit, the payload is POSTed to the hardcoded endpoint as JSON; the result is reported via a toast notification.
5. The feature is always available — there is no config to disable it.

---

#### Acceptance Criteria

- [ ] `_FEEDBACK_ENDPOINT` is a module-level string constant in `src/rotaris_core/feedback.py`; it is not read from any config file or environment variable.
- [ ] "Send feedback" always appears in the command palette and always opens `FeedbackScreen`.
- [ ] `/feedback` always opens the `FeedbackScreen`.
- [ ] Typing a message and clicking Send POSTs to the hardcoded endpoint with the correct JSON payload.
- [ ] With "Include session log" checked and an active session, the `debug_log` field in the payload contains the current session's `debug.log` contents (truncated at 256 KiB).
- [ ] With "Include session metadata" checked and an active session, the `session_metadata` field contains `persona`, `model`, `execution_status`, and `session_id`.
- [ ] Both checkboxes default to OFF and require explicit user opt-in.
- [ ] When no session is active, both checkboxes are disabled with an explanatory label.
- [ ] On HTTP 200: screen dismisses with a success toast.
- [ ] On HTTP 400/500: screen stays open with the message preserved and an error toast appears.
- [ ] On network timeout: screen stays open with the message preserved and a timeout error toast appears.
- [ ] The HTTP request respects the hardcoded timeout constant.
- [ ] No secrets, API keys, environment variables, or file contents outside the specified payload fields are sent.

---

#### Dependencies

- Depends on: command palette system (`tui/providers/command_palette.py`, `tui/screens/command_palette_cheatsheet.py`), slash command registry (`tui/widgets/slash_commands.py`), session diagnostics (`session/diagnostics.py`).
- Blocks: None.

---

#### Resolved Conflicts

| Prior Requirement | Conflict                        | Resolution |
| ----------------- | ------------------------------- | ---------- |
| None              | N/A — new feature, no prior art | N/A        |

---

#### Notes

**Assumptions and self-resolved decisions:**

- **Hardcoded endpoint**: The feedback URL is a constant in the source code — not in `agents.yaml`, not in environment variables. This means every copy of Rotaris (individual users, enterprise deployments, etc.) sends feedback to the same Rotaris-owned endpoint. The endpoint value is chosen by the Rotaris maintainers at implementation time.
- **No authentication from client side**: Since the endpoint is Rotaris's own, there is no user-facing API key or auth token to configure. The endpoint itself may use rate limiting or other server-side protections.
- **Transport**: HTTP POST with JSON body — simple, universal, no extra dependencies beyond `httpx` (already a dependency via the fetch tool).
- **Log truncation**: 256 KiB cap on `debug_log` prevents accidental multi-megabyte uploads. This is generous enough for typical session logs while protecting the endpoint.
- **No file attachment beyond `debug.log`**: The session `debug.log` is the single most useful diagnostic artifact. We deliberately exclude `issues.json`, `metrics.json`, and conversation dumps to keep the payload focused and privacy-safe.
- **Fire-and-forget submission**: The POST runs in a background task so the TUI does not block.
- **App version sourcing**: `importlib.metadata.version("Rotaris")` is the standard Python mechanism and already available as a dependency.
- **Always available**: Unlike the previous revision, there is no config toggle to disable the feature. The "Send feedback" entry is always present in the command palette. This keeps the implementation simple and ensures feedback is always one click away.

**Out of scope for v1:**

- File attachments beyond `debug.log` (e.g., screenshot, config dump, custom log selection).
- Inline issue tracker integration (GitHub Issues, Jira, Linear).
- Offline queueing (submissions are fire-and-forget; if the network is down, the user must retry manually).
- Feedback submission history or status tracking within the TUI.
- Rate limiting beyond what the server enforces.
- Automated crash reporting (the feature is explicitly user-initiated).
- Per-company or per-deployment endpoint configuration.
