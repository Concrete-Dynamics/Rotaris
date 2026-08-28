---
req-id: [SWR-1300, SWR-1301, SWR-1302, SWR-1303, SWR-1304, SWR-1305, SWR-1306, SWR-1307, SWR-1309, SWR-1310, SWR-1311, SWR-1312, SWR-1314, SWR-1315, SWR-1316, SWR-1317, SWR-1318, SWR-1319, SWR-1320, SWR-1321]
status: approved
trace: required
test: required
title: "Runtime Control & Responsiveness"
---

# 1300-runtime-control spec

## SWR-1300 — Runtime Control & Responsiveness
trace: optional
test: optional

Interrupting and stopping runs responsively: double Ctrl+C stop, quit hardening, and general runtime hardening.

Derived requirements: [SWR-1322 — Steering and queued prompt registry and submission API](1300-runtime-control/SWR-1322-steering-queued-prompt-registry.md)

## SWR-1301 — Graceful First Interrupt
legacy-id: REQ-20260414-170500-001
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-170500.md

The first `Ctrl+C` must request shutdown for the active framework run instead of leaving agent work running.

## SWR-1302 — Forceful Second Interrupt
legacy-id: REQ-20260414-170500-002
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-170500.md

The second `Ctrl+C` must immediately force the process to exit.

## SWR-1303 — Stop Active Agents
legacy-id: REQ-20260414-170500-003
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-170500.md

Shutdown must pause or close active OpenHands conversations and cancel active orchestration tasks.

## SWR-1304 — Background Mode Support
legacy-id: REQ-20260414-170500-004
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-170500.md

The double-`Ctrl+C` behavior must work in `rotaris-cli run --background`.

## SWR-1305 — TUI Support
legacy-id: REQ-20260414-170500-005
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-170500.md

The double-`Ctrl+C` behavior must work in the interactive TUI entry path as well.

## SWR-1306 — Session Persistence
trace: optional
legacy-id: REQ-20260414-170500-006
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-170500.md

Interrupted runs must persist a paused session state with an interruption message when graceful shutdown completes.

## SWR-1307 — No New Dependencies
trace: optional
test: optional
legacy-id: REQ-20260414-170500-007
date: 2026-04-14
source: docs/requirement-log/done/requirements-20260414-170500.md

The implementation must use the existing stdlib/runtime stack only.

## SWR-1309 — Unified Interactive Quit Path
legacy-id: REQ-20260506-QUIT-001
date: 2026-05-06
source: docs/requirement-log/done/requirements-20260506-quit-hardening.md

`Ctrl+Q` during an active run must request the same coordinated shutdown path used by the interactive interrupt flow instead of exiting the TUI immediately.

## SWR-1310 — Visible Shutdown Progress
legacy-id: REQ-20260506-QUIT-002
date: 2026-05-06
source: docs/requirement-log/done/requirements-20260506-quit-hardening.md

While shutdown is pending, the TUI must remain responsive and show that the run is stopping and when force-exit will occur.

## SWR-1311 — Deferred Exit After Run Teardown
legacy-id: REQ-20260506-QUIT-003
date: 2026-05-06
source: docs/requirement-log/done/requirements-20260506-quit-hardening.md

When the active run stops cleanly, the app must exit only after the run task and loop teardown complete.

## SWR-1312 — Automatic Escalation
legacy-id: REQ-20260506-QUIT-004
date: 2026-05-06
source: docs/requirement-log/done/requirements-20260506-quit-hardening.md

If shutdown remains blocked past the grace window, the app must force-exit automatically without requiring the terminal to be killed manually.

## SWR-1314 — Reuse Existing Runtime Controls
legacy-id: REQ-20260506-QUIT-006
date: 2026-05-06
source: docs/requirement-log/done/requirements-20260506-quit-hardening.md

The implementation must reuse the existing Ralph loop and scheduler shutdown machinery instead of introducing a new execution control plane.

## SWR-1315 — Model calls must preserve only the current leading system prompt and remove stale system messages from persisted history.
legacy-id: REQ-20260527-RUNTIME-001
date: 2026-05-27
source: docs/requirement-log/done/requirements-20260527-runtime-hardening.md

Added `ModelInputSanitizer` at the LLM completion boundary.

## SWR-1316 — Model calls must remove historical rendered tool-description payloads from replayed history without dropping normal user, assistant, or tool observations.
legacy-id: REQ-20260527-RUNTIME-002
date: 2026-05-27
source: docs/requirement-log/done/requirements-20260527-runtime-hardening.md

Sanitizer uses conservative structural/content patterns and records counters.

## SWR-1317 — Persona prompt rendering must use the same filtered tool set as agent construction.
trace: optional
legacy-id: REQ-20260527-RUNTIME-003
date: 2026-05-27
source: docs/requirement-log/done/requirements-20260527-runtime-hardening.md

Added `ResolvedPersonaRuntime` and launch-time prompt/tool validation.

## SWR-1318 — Artifact auto-context must be deterministic and prioritize relevant, recent, failed, or diagnostic evidence.
legacy-id: REQ-20260527-RUNTIME-004
date: 2026-05-27
source: docs/requirement-log/done/requirements-20260527-runtime-hardening.md

Replaced oldest-first baseline ordering with scored selection and context diagnostics.

## SWR-1319 — Suspicious success reports must be downgraded when they contain errors, failed tests, or blocking follow-up actions.
legacy-id: REQ-20260527-RUNTIME-005
date: 2026-05-27
source: docs/requirement-log/done/requirements-20260527-runtime-hardening.md

Added scheduler report validation with diagnostics.

## SWR-1320 — Session evidence must expose model-input sanitization, context selection, and report-validation records.
legacy-id: REQ-20260527-RUNTIME-006
date: 2026-05-27
source: docs/requirement-log/done/requirements-20260527-runtime-hardening.md

Added additive JSONL evidence files and summary warnings.

## SWR-1321 — Runtime hardening changes must include regression coverage.
trace: optional
legacy-id: REQ-20260527-RUNTIME-007
date: 2026-05-27
source: docs/requirement-log/done/requirements-20260527-runtime-hardening.md

Added focused unit tests for sanitizer, persona runtime resolution, artifact selection, and report validation.

## History

Source documents were merged into this epic on 2026-07-18; the originals live in
git history under `docs/requirement-log/`.
