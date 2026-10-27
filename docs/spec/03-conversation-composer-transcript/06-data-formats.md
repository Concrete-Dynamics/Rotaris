# Conversation, Composer, and Transcript — On-disk files (externally observable)

Part 6 of 7 of [domain 03](../03-conversation-composer-transcript.md), which indexes every part.

## Data & Formats

### On-disk files (externally observable)

| File | Format | Semantics |
| --- | --- | --- |
| Saved prompts (REQ-LIBRARY-138; no path or document format is contractual) | two ordered lists of strings, `history` and `stash` | Desktop prompt history (≤200) and stash (≤100); no partly applied change is observable; blanks dropped on load; unreadable or wrongly shaped → empty |
| Prompt roots: `<workspace>/.agents/prompts/`, `~/.agents/prompts/`, `<user config dir>/prompts/` | Markdown with optional YAML frontmatter | Prompt-file slash commands (REQ-CHAT-160); first root to yield a normalized name wins; unreadable or malformed files skipped with a logged reason |
| Workspace `agents.yaml` | YAML config | The `display` section — tool result and input visibility and their line caps (REQ-CHAT-166, REQ-CONFIG-172, REQ-CONFIG-175) |
| Desktop preference store | key/value | Per-workspace composer draft (REQ-CHAT-015); transcript display preferences — auto-collapse, tool grouping, reasoning visibility (REQ-CHAT-067, REQ-CHAT-167); divider position (REQ-CHAT-010, persisted with every pane layout under REQ-SHELL-069). Keys registered by REQ-SHELL-006, written user-wide under REQ-CONFIG-405, and disjoint from the YAML surface |

### Session snapshot transcript rows

Persisted transcript rows are objects with fields: `ts` (timestamp), `content`, `tool`, `detail`, `full_text`, `full_detail`, `persona`, `tool_event_key`, `status`, `duration`, `started_at`, `chars`, `stream_id`; the role each row carries is drawn from the open vocabulary REQ-CHAT-047 defines, which this table does not restate and does not close. The session snapshot also carries user-only edit diffs (separate from transcript events), planner and agent todo state, pending questions, and pending approvals. It is the single record the transcript projects from, and the record rows are released to and paged back from under REQ-CHAT-165; no second transcript store exists, on disk or anywhere else. Where the record is held is REQ-SESSION-001's and no path for it is fixed here.

### Structured-question answer payload

Resolved answers are a map `{<step_id>: {"selected_option": string|null, "freeform_text": string|null}}`; the model-visible rendering is a `## User Answers` section with `- **<step_id>**: <value>` lines and `(no answer)` for unanswered steps.

### Custom prompt-command files

Markdown files with optional YAML frontmatter (`description`, `argument-hint`), discovered per REQ-CHAT-160; body placeholders `$$`, `$ARGUMENTS`, `$1`–`$9`, `$UPPER_NAME`, expanded per REQ-CHAT-161, with an unsupplied value expanding to the empty string.

### Defaults and limits summary

| Value | Default / limit |
| --- | --- |
| Composer draft debounce | 200 ms |
| Desktop pending-state visibility | on the whole-session update that carries it, within REQ-MONITOR-222's visibility budget; no poll cycle exists (REQ-CHAT-097) |
| Desktop live-row refresh interval | at least once per 1000 ms (250 ms while a terminal stream is live) |
| Thinking-row staleness cutoff | 3600 s |
| Structured-question wait | 300 s default; 0 = unlimited |
| Prompt history cap | 200 entries persisted (REQ-CHAT-045) |
| Stash cap | 100 entries persisted (REQ-CHAT-045) |
| Slash suggestion popup rows | 8 |
| Rendered diff lines | 50 before truncation (REQ-CHAT-050) |
| Tool result / input line caps | 10 / 2 by default; settable to 1, 2, 5, 10, 20, 50, or unlimited (REQ-CHAT-166) |
| Retained row measurements and renderings | bounded, least-recently-used eviction (REQ-CHAT-058); resident rows bounded with on-demand paging (REQ-CHAT-165) |
| Highlight contrast floor | 4.5:1 against the surface behind the text |
| Group search blob | 2,000 chars |
| Queued-messages panel height | 150 px |
| Skill description clip (skill listing) | 120 chars (REQ-CHAT-162) |
| Child task summary compaction | 110 chars (REQ-CHAT-068) |
| Run-timing indicator | `M:SS`, or `H:MM:SS` past one hour (REQ-CHAT-158) |
| Provider-stall threshold | 10 s with no provider output (REQ-CHAT-164) |
