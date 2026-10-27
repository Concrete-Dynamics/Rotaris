# Resolution Record — Domain 03, Conversation, Composer, and Transcript — Graphical-only sweep

Part 1 of 3 of [domain 03's resolutions](../03-conversation-composer-transcript.md), which indexes every part.

## Graphical-only sweep

Sections 18 through 26 of the draft — 49 requirements, `REQ-CHAT-104` through `REQ-CHAT-152` —
specified a full-screen text-mode frontend and nothing else. Every one is withdrawn in place.
Where a user capability lived only there, it is rescued into a desktop-reachable requirement; the
table below names the requirement that now carries each. Ten new requirements
(`REQ-CHAT-158` … `REQ-CHAT-167`) exist solely because of this sweep; the eleventh new requirement,
`REQ-CHAT-168`, comes from open question 18.

Nothing a user could do through the terminal frontend was lost. Four capabilities had no desktop
home at all and are the substance of the rescue: the **run-timing indicator** (REQ-CHAT-158), the
**prompt-file command system** (REQ-CHAT-160, REQ-CHAT-161), **tool-output display settings with
line caps** (REQ-CHAT-166) together with the **global reasoning-visibility preference**
(REQ-CHAT-167), and **bounded transcript residency with on-demand paging of older rows**
(REQ-CHAT-165), which replaces the terminal's separate on-disk transcript archive with paging
against the session record the desktop already keeps. Three further capabilities were partly
present and are now stated: **skill listing and manual skill loading** (REQ-CHAT-162), the
**stream-to-display rules** that keep tool-call chunks and provider deliberation out of the answer
body (REQ-CHAT-163), and the **provider-stall indicator** (REQ-CHAT-164).

Two things the terminal offered were deliberately *not* rescued. Composer steering was not
reproduced as a desktop composer mode, because steering already has a surface of its own in
REQ-MONITOR-070 and REQ-MONITOR-137 and a second one would need its own target-selection and
degradation rules. And the terminal's `/background` command was not carried forward: it toasted
that background execution was not supported while persisting a session with a background status,
which advertises a capability the product does not have; whether runs may detach is a
run-orchestration decision, not a composer one, and no requirement in this domain now mentions it.

| Withdrawn | What it specified | Capability now carried by |
| --- | --- | --- |
| REQ-CHAT-104 | Terminal composer modes, submission keys, placeholder | REQ-CHAT-001 (multiline composer, Enter / Shift+Enter), REQ-CHAT-004 (placeholder) |
| REQ-CHAT-105 | Composer border title and meta bar (mode, send, steer, model chip, stash chip, run-timing chip, settings hint) | REQ-CHAT-008 (run-state label), REQ-CHAT-009 (selector chips), REQ-CHAT-042 (stash affordance), **REQ-CHAT-158** (new — run timing) |
| REQ-CHAT-106 | Run-timing chip semantics | **REQ-CHAT-158** (new) |
| REQ-CHAT-107 | Submission routing by session and run state | REQ-CHAT-005, REQ-CHAT-011, REQ-CHAT-035; steering via REQ-MONITOR-070 |
| REQ-CHAT-108 | Steering from the composer, degrading to queueing | REQ-MONITOR-070 (steer card), REQ-MONITOR-137 (initiation and refusal) |
| REQ-CHAT-109 | Terminal-queued prompts unscoped | REQ-CHAT-039 (ownership), REQ-CHAT-038 and REQ-CHAT-040 (consumption) |
| REQ-CHAT-110 | Terminal history recall, ring of 50 | REQ-CHAT-016, REQ-CHAT-017 |
| REQ-CHAT-111 | `<workspace>/.rotaris/prompt_history.json` | REQ-CHAT-045 (one per-workspace prompt file for history and stash) |
| REQ-CHAT-112 | User-global `prompt_stash.json` | REQ-CHAT-045 |
| REQ-CHAT-113 | Four routes to stash; pop appends to composer | REQ-CHAT-042, REQ-CHAT-043, REQ-CHAT-044 |
| REQ-CHAT-114 | Terminal slash interception and error reporting | REQ-CHAT-019, REQ-CHAT-020, REQ-CHAT-023 |
| REQ-CHAT-115 | Unknown `/token` forwarded to the agent | REQ-CHAT-021 — no rescue; the desktop reading is canonical and an unknown command is never prompt content |
| REQ-CHAT-116 | Terminal registry semantics | REQ-CHAT-018, REQ-CHAT-022 |
| REQ-CHAT-117 | `/stop`, `/pause`, `/new`, `/resume`, `/background`, `/quit` | REQ-CHAT-029, REQ-CHAT-031; quitting belongs to the desktop shell domain; `/background` deliberately not carried forward (see above) |
| REQ-CHAT-118 | `/mcp`, `/improvements`, `/tools`, `/theme`, `/logout`, `/help`, `/model`, `/compress`, `/clear`, `/search` | REQ-CHAT-028 (palette mirroring), **REQ-CHAT-159** (new — argument-taking commands, `/theme`, `/logout`), **REQ-CHAT-162** (new — skills), **REQ-CHAT-166** (new — tool visibility and caps), REQ-CHAT-029–REQ-CHAT-034 |
| REQ-CHAT-119 | `/cancel` resolving against a screen stack | REQ-CHAT-002 (Escape order), REQ-CHAT-029 (`/stop`) |
| REQ-CHAT-120 | Terminal suggestion overlay and ghost text | REQ-CHAT-024, REQ-CHAT-025, REQ-CHAT-026, REQ-CHAT-027 |
| REQ-CHAT-121 | Prompt files under `~/.codex/prompts/` and `~/.agents/prompts/` | **REQ-CHAT-160** (new — prompt roots, naming, frontmatter, collisions) |
| REQ-CHAT-122 | `$$`, `$ARGUMENTS`, `$1`–`$9`, `$UPPER_NAME` expansion | **REQ-CHAT-161** (new) |
| REQ-CHAT-123 | `/skills` listing and `/skill <path>` loading | **REQ-CHAT-162** (new), with REQ-WORKSPACE-057 for path handling |
| REQ-CHAT-124 | Skill payload shape, collision logging, in-context marking | REQ-CHAT-034 (reachability, collisions), **REQ-CHAT-162** (new — payload) |
| REQ-CHAT-125 | Transcript border title and follow indicator | REQ-CHAT-070, REQ-CHAT-072 |
| REQ-CHAT-126 | Block / row / Markdown-source render caches | REQ-CHAT-055, REQ-CHAT-058, **REQ-CHAT-165** (new) |
| REQ-CHAT-127 | Per-role terminal row styling | REQ-CHAT-046, REQ-CHAT-047, REQ-CHAT-056, REQ-CHAT-057, REQ-CHAT-060, REQ-CHAT-062, REQ-CHAT-068 |
| REQ-CHAT-128 | Reasoning header and global show-reasoning flag | REQ-CHAT-062, **REQ-CHAT-167** (new — global reasoning-visibility preference) |
| REQ-CHAT-129 | Live-stream phases, spinner, waiting-on-provider message | REQ-CHAT-062, REQ-CHAT-063, **REQ-CHAT-164** (new — provider stall) |
| REQ-CHAT-130 | 4,000-char live Markdown window, fence auto-closing | REQ-CHAT-056 (mid-stream Markdown renders without error), REQ-CHAT-055 (bounded cost) |
| REQ-CHAT-131 | Stream-to-display rules and reasoning recognition | **REQ-CHAT-163** (new) |
| REQ-CHAT-132 | Tool result/input visibility, line caps, status-marker icons | **REQ-CHAT-166** (new), REQ-CHAT-060 (closed status vocabulary and rendering) |
| REQ-CHAT-133 | Terminal diff block, 50-line cap, failed writes, undo | REQ-CHAT-050 (amended to carry the 50-line cap and both rules) |
| REQ-CHAT-134 | Queued-prompt section with `[unqueue]` | REQ-CHAT-036, REQ-CHAT-037 |
| REQ-CHAT-135 | Agent-scoped views and focus badge | REQ-CHAT-069 (amended to name the focused agent, its state, and its elapsed time) |
| REQ-CHAT-136 | URL linkification and browser opening | REQ-CHAT-076 (amended to cover bare URLs and to report a failure to open) |
| REQ-CHAT-137 | Mouse selection, right-click copy, clipboard failure text | REQ-CHAT-075 (amended to cover pointer selection and to report a refused copy) |
| REQ-CHAT-138 | Reasoning-header hit tracking | REQ-CHAT-076 |
| REQ-CHAT-139 | `transcript.max_in_memory_events`, `transcript.archive_page_size` | **REQ-CHAT-165** (new) — residency is product behaviour, not configuration |
| REQ-CHAT-140 | `transcript_archive.jsonl` and page sentinels | **REQ-CHAT-165** (new) — paging against the session record, this domain adding no on-disk format of its own. The archive file itself was later confirmed as the sessions domain's: REQ-SESSION-192 and REQ-SESSION-131 own `state/transcript_archive.jsonl` and its paging |
| REQ-CHAT-141 | Scroll-up archive paging | **REQ-CHAT-165** (new) |
| REQ-CHAT-142 | 120 ms refresh interval, scroll restoration | REQ-CHAT-063, REQ-CHAT-071 |
| REQ-CHAT-143 | Terminal search modal, proportional scrolling | REQ-CHAT-074 — which navigates to the matched row exactly |
| REQ-CHAT-144 | Two-step timed `/clear` | REQ-CHAT-082, REQ-CHAT-083, REQ-CHAT-084 |
| REQ-CHAT-145 | Terminal `/compress` | REQ-CHAT-078, REQ-CHAT-079, REQ-CHAT-080, REQ-CHAT-081 |
| REQ-CHAT-146 | Display-only todo pane and source labelling | REQ-CHAT-085–REQ-CHAT-088; REQ-CHAT-088 amended to carry the source priority and to require the source to be named |
| REQ-CHAT-147 | Four-state todo counts and per-phase lines | REQ-CHAT-085, REQ-CHAT-086 (amended to add the abandoned glyph), REQ-CHAT-088 (amended to map ABANDONED to its own state) |
| REQ-CHAT-148 | Queued prompts visible in the todo pane | REQ-CHAT-040 (the "Queued Prompts" phase), REQ-CHAT-085 (renders phases) |
| REQ-CHAT-149 | Leader chords and `tui.keyboard.leader` | REQ-CHAT-002 (desktop shortcuts), REQ-CHAT-028 (every palette action reachable as a slash command) |
| REQ-CHAT-150 | Armed-leader indicator and 2 s timeout | No rescue — there is no leader to arm |
| REQ-CHAT-151 | Palette screen with shortcut cheat sheet | REQ-CHAT-028 (palette mirroring), REQ-CHAT-002 (F1 keyboard help) |
| REQ-CHAT-152 | Leader / desktop-shortcut boundary and command fallback | REQ-CHAT-028 |

Three on-disk formats disappeared with the terminal frontend and were removed from this document's
Data & Formats: `<workspace>/.rotaris/prompt_history.json`, `~/.config/rotaris/prompt_stash.json`, and
`<session_dir>/state/transcript_archive.jsonl`. One was added: the prompt roots of REQ-CHAT-160.
The third of those three was superseded: `state/transcript_archive.jsonl` is not a terminal artifact
and survives as part of the session record, owned by the sessions domain — REQ-SESSION-192 bounds the
live transcript file and evicts older rows into it, and REQ-SESSION-131 fixes its append-only page
format. This domain states no on-disk format for it and none of its own; REQ-CHAT-165 states only that
released rows are brought back on demand, and the rows it pages against are the ones domain 07 keeps.
The `agents.yaml` row now names only the `display` section, and the settings-storage row is
restated as the desktop preference store of REQ-CONFIG-405. The nine section headings covering
`REQ-CHAT-104` … `REQ-CHAT-152` are marked withdrawn in place rather than deleted, so the
requirement numbering stays continuous and unreused.
