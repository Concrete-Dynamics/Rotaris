# Rotaris ↔ TUI/backend feature parity — gap plan

## Context

Rotaris (PySide6 desktop, `apps/rotaris/`) is intended to give full functionality/UX parity with the Textual TUI (`src/rotaris_core/tui/`) and the underlying Rotaris backend. This doc is a prioritized gap list to work through incrementally — pick one numbered item at a time.

Compiled by parallel codebase exploration (2026-07-13) of the TUI feature set, the Rotaris feature set, and existing repo docs.

Two gap groups are **already speced/planned elsewhere** — execute those plans, don't redesign:

- `docs/requirement-log/done/requirements-20260713-rotaris-markdown-rendering.md` (status: Done) — Markdown rendering in transcript/artifacts.
- `docs/superpowers/specs/2026-07-13-rotaris-workspace-inspector-fixes-design.md` + `docs/superpowers/plans/2026-07-13-rotaris-workspace-inspector-fixes.md` (written, not yet executed) — root context-ring bug (stuck at 0%), root reasoning-staleness bug, 3-tier tool pills, editable todos.

Rotaris already **exceeds** the TUI in some areas (git worktree/commit/diff views, dedicated Mission/Dashboard views, provider-auth recovery flow) — those are excluded below, not gaps.

## Gap list, by priority

### P0 — functional gaps, not just polish

1. **Improvement proposals are read-only in Rotaris — done (approve/reject/defer).** Rotaris dashboard now loads the workspace's latest `ImprovementProposalArtifact` via `ConfigService.refresh_improvement_proposals()` and lets the user approve/reject/defer each proposal inline (`ConfigService.set_proposal_status`, persisted via `rotaris_core.improvement.approval.set_proposal_status`). Note: "start an improvement run" is _not_ wired — the real TUI `ImprovementProposalsScreen` call site (`tui/app.py:866`) doesn't pass a `start_improvement_run` callback either, so no app currently drives `prepare_improvement_run` end-to-end; that remains a follow-up gap beyond today's actual TUI parity.
2. **Markdown rendering — done.** Implemented via cached, safe Mistune→Qt rich text in the workspace transcript and model-authored activity fields, plus a live artifact Preview tab. Links open externally; partial streaming Markdown degrades safely. Requirement moved to `docs/requirement-log/done/requirements-20260713-rotaris-markdown-rendering.md`.
3. **No graceful pause distinct from cancel — done.** Added `RunBridge.pause()`/`pause_agent()`, which call the same `RalphLoop.request_shutdown(force=False)` the TUI's `/pause` uses (finish current step via `scheduler.request_stop(force=False)`'s per-conversation graceful pause, then stop) instead of a raw `task.cancel()`. `RunBridge.cancel()` is unchanged (still a hard cancel) — only additive. Wired a "Pause" button next to "Cancel" in both `views/workspace.py`'s inspector (enabled only for the orchestrator node) and `views/mission.py`'s control panel, both routed through `MainWindow._pause_agent`, which only supports the orchestrator (no per-child graceful pause, matching the TUI's loop-level-only `/pause`).
4. **Root/orchestrator inspector bugs — done.** Context-ring-0% and reasoning-staleness fixes (Tasks 1-2 of the linked inspector-fixes plan) were already present in `config_service.py`/`run_bridge.py`/`session/state.py` (`root_context_tokens` field + root `AgentNode.ctx_used`/`.reasoning` construction) — verified via the plan's own test assertions, all green.

### P1 — interaction/composer richness

5. **No slash commands / prompt templates / skill invocation from Rotaris composer.** TUI supports `/prompts:<name>` (Codex-style templates from `~/.codex/prompts`, `src/rotaris_core/tui/prompt_commands.py`), `/skill <path>` + auto-registered per-skill trigger commands (`src/rotaris_core/tui/skill_commands.py`), plus a fuzzy autocomplete overlay (`SlashCommandOverlay`). Rotaris composer (`views/workspace.py:171-206`) is a plain text box — no way to invoke a saved prompt or skill at all. Library's Skills tab is read-only display only (`views/library.py:172-180`), no "run this skill" action.
6. **No prompt history recall** (Up/Down arrow through past submitted prompts). TUI persists via `PromptHistory` → `.rotaris/prompt_history.json` (`src/rotaris_core/tui/prompt_history.py`).
7. **Prompt stash persistence unconfirmed.** TUI stash persists to global config dir across restarts (`src/rotaris_core/tui/stash.py`); Rotaris `stash_prompt`/`pop_stash` (`models/store.py:218-233`) appears in-memory only for the session — verify and add persistence if missing.
8. **No transcript search.** TUI has a dedicated `TranscriptSearchScreen` (`src/rotaris_core/tui/screens/transcript_search.py`) with live substring search + jump-to-match. No Rotaris equivalent; needed once transcripts get long in multi-agent runs.
9. **No force-compress-context action.** TUI's `/compress` triggers context compression on demand across all active agents. Not present in Rotaris.
10. **No quota-wait flow.** TUI's `QuotaWaitScreen` (`src/rotaris_core/tui/screens/modals.py`) offers "keep waiting / change model / cancel" when a provider's quota is exhausted mid-run. Rotaris has auth-_failure_ recovery (different trigger: bad credentials) but nothing for quota exhaustion specifically.
11. **No clear-transcript action** (TUI's `/clear`, two-step confirm).
12. **Collapsible reasoning/thinking blocks — likely absent.** TUI lets users click to collapse "Thought…" blocks, or toggle globally. Rotaris renders thinking events but with no confirmed collapse/toggle affordance — verify and add.
13. **Copy-to-clipboard from transcript — likely absent/unconfirmed.** TUI supports drag-select + copy with an OSC-52 fallback for headless/remote terminals. Native Qt `QLabel` selection may partially cover this in Rotaris — verify.

### P2 — settings/config depth

14. **Compression threshold has no UI control.** Field exists and is displayed (`RuntimeToggles.compression_threshold_pct`) but Settings view has no slider/spinbox to change it — TUI has a dedicated ASCII-bar slider screen (`src/rotaris_core/tui/screens/compression_settings.py`).
15. **No MCP secrets management.** TUI's `MCPSecretsScreen` (`src/rotaris_core/tui/screens/mcp_secrets.py`) lets users add/edit/delete masked env vars per server, Workspace/Global scope. Rotaris only has an enable/disable toggle (`views/library.py:150-170`), session-scoped only.
16. **No theme switching.** TUI ships 3 themes (`mono`, `tokyo-night`, `dark`) switchable live. Rotaris appears to have a fixed Qt style.
17. **No Dev Options equivalent** (memory diagnostics toggle) — low priority, dev-only feature.

### Already-planned, not yet executed (don't re-design, just build)

18. Editable todos (add/rename/remove) with write-through to the live `TodoList` — spec + 12-task plan already written in `docs/superpowers/plans/2026-07-13-rotaris-workspace-inspector-fixes.md`. Note: this is actually **beyond** TUI parity (TUI's todo pane is read-only too) but is bundled with the inspector fixes in that plan.
19. 3-tier tool-call pill highlighting (never-called / called-idle / active-now) — same plan, Tasks 3-4.

## Explicitly NOT gaps (parity already held, or Rotaris ahead)

- **Background/concurrent execution**: both TUI and Rotaris lack real background execution (TUI's `/background` is an explicit stub; Rotaris's `RunBridge` only runs one session at a time, `start()` returns `False` if busy). Not Rotaris-specific.
- **Diagnostics viewer** (issues.json/tool-calls.jsonl/debug.log): neither surface lets a user browse these files in-app. Would be a joint enhancement beyond current TUI capability, not required for parity.
- **Git integration**: Rotaris has full worktree/commit/diff/create-worktree UI; TUI only shows a read-only branch name. Rotaris is ahead here.
- **Persona definition editing** (tools/prompt/MCP list per persona): neither app supports this from the UI (config-file only in both).
- **Subscription/usage real numbers**: Rotaris attempts this (structurally wired, hardcoded "unavailable"); TUI doesn't show this concept at all. Not a parity requirement.

## Suggested phasing

1. Execute the already-written inspector/todo plan (items 4, 18, 19) — lowest risk, spec already reviewed.
2. Markdown rendering (item 2) — highest visible UX payoff, doc already scoped with `mistune` recommendation.
3. Improvement-proposal actionability (item 1) — closes a real capability gap, moderate scope (wire approve/reject/defer/start against existing `ConfigService`/backend APIs the TUI already uses).
4. Pause-vs-cancel distinction (item 3) — needs a `RunBridge` graceful-pause path.
5. Composer richness batch (items 5-13) — bundle as one workstream, all touch `views/workspace.py`'s composer/transcript widgets.
6. Settings depth batch (items 14-17) — bundle as one Settings-view workstream.

## Verification

When work starts on any item: verify via `make test-rotaris` (pytest-qt) plus manual exercise of the affected view (`uv run python -m rotaris .` or `--demo`), per this repo's existing UI-testing convention. Update this doc's item status (done/in-progress) as each is tackled, and cross-reference `docs/requirement-log/` if a formal requirement doc gets created for a given item.
