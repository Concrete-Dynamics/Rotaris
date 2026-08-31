---
reference: ROTARIS-CRW-001
domain: conversation-composer-transcript
date: 2026-08-30
status: resolved
---

# Resolution Record — Domain 03, Conversation, Composer, and Transcript

This record disposes of every open question raised in the draft of
[`../03-conversation-composer-transcript.md`](../03-conversation-composer-transcript.md)
(requirement prefix `REQ-CHAT`). The body of that specification has been amended so that each
decision below is stated normatively in place; the original open-question numbering is preserved
here so the draft and the resolved specification can be read against one another.

The product-owner decisions in force while these were resolved:

1. **Compatibility ambition: behavioral inspiration only.** The rewrite has no obligation to match
   any other implementation's formats, surface, exit codes, or event vocabulary. Where a case is
   under-determined this record chooses; awkward or arbitrary behavior is never preserved for
   compatibility's sake.
2. **Defect policy: omit what conflicts.** Internal contradictions are resolved toward the reading
   more coherent with the rest of the document; where no coherent reading exists, the behavior is
   omitted rather than reproduced.
3. **Unbuilt-but-intended behavior is in scope.** No requirement is dropped merely because it
   describes intent rather than something known to work.
4. **The product is one Electron desktop application, with no command-line interface and no
   terminal user interface.** Not deferred — removed. Domains 17 and 18 are retired and the
   `REQ-TUI` and `REQ-CLI` identifiers are withdrawn. See the graphical-only sweep below, which is
   the larger half of the work in this domain: nine of the draft's twenty-eight sections described
   a text-mode frontend. Running external programs — an agent's own terminal commands, lifecycle
   hooks, tool servers on the stdio transport, version-control invocations — remains fully in
   scope; what was removed is any way for a *user* to drive the product from a shell or a
   full-screen text-mode interface.
5. **Message text states information content, not wording** — except where a string is part of a
   machine-readable contract (an event field value, an enum, a parseable format). Open questions
   asking about exact phrasing, punctuation, separators, or grammatical inflection of a
   *human-readable* message are resolved by stating what the message must convey and leaving the
   wording to the implementation.

Cross-domain vocabulary is cited rather than reinvented: `02-run-monitoring-steering.md` (steering
surface, tool-row status vocabulary, live clock ticks, per-agent elapsed time),
`13-workspace-context-onboarding.md` (skill discovery, `SKILL.md` frontmatter, invocation modes,
manual skill loading), `15-settings-configuration.md` (the `display` section of `agents.yaml`, the
desktop preference store, default write scope), `12-desktop-shell-windows.md` (theme token
contrast guarantees, persona windows), and `14-library-artifacts-improvements.md` (the stash
controls and the artifact library).

Of the 35 open questions raised in the draft: **25 resolved**, **1 omitted**, and **9 moot** (they
existed only because of the terminal frontend). The one question escalated by this pass — OQ 2,
image attachments in the composer — was answered by the product owner on 2026-08-30 and the answer
is recorded in [`../../clean-room/specification-gate.md`](../../clean-room/specification-gate.md);
it is carried below as resolved. No question raised against this document remains open.

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

## Dispositions

Dispositions: **RESOLVED** (decided here and written normatively into the spec), **OMITTED**
(withdrawn or narrowed, the behavior not being worth specifying), **MOOT** (the question existed
only because of a surface that no longer exists), **ESCALATED** (a product decision left to the
product owner and restated in the spec's Open Questions section).

| OQ # | Disposition | Decision taken | Requirements touched |
| --- | --- | --- | --- |
| 1 | OMITTED | No pinned "most recent user prompt" header. The transcript already gives the reader three ways to keep their place — the follow-state indicator and anchored restoration (REQ-CHAT-070, REQ-CHAT-071), the new-output button (REQ-CHAT-072), and search (REQ-CHAT-074) — and a fourth, permanently-occupied strip above a transcript whose rows are already attributed per block (REQ-CHAT-057) buys little and costs vertical space in the one view that most needs it. The agent-scoped variant of the question is answered by REQ-CHAT-069, which now names the agent the scope toggle refers to. No requirement is added. | none (REQ-CHAT-057, REQ-CHAT-069, REQ-CHAT-070 confirmed unchanged in substance) |
| 2 | RESOLVED | Answered by the product owner on 2026-08-30 and recorded in [`../../clean-room/specification-gate.md`](../../clean-room/specification-gate.md): the composer **does** accept image attachments, gated on model capability. Of the three candidate options the middle one was taken — attachments are offered through drag-and-drop and a file picker, are enabled only for models that announce image input, and the model selection surface refuses a change that would discard them rather than discarding them silently. The specification no longer states "text only" by omission: REQ-CHAT-001 names attachments as part of the composer, and REQ-CHAT-169 to REQ-CHAT-174 carry the attachment surface, the capability gate, the wire and snapshot handling, and the token-estimation rule. | REQ-CHAT-001, REQ-CHAT-169, REQ-CHAT-170, REQ-CHAT-171, REQ-CHAT-172, REQ-CHAT-173, REQ-CHAT-174 |
| 3 | RESOLVED | Artifacts get no transcript row treatment of their own, and the partial / hidden / full display setting is dropped from the product. An agent-published artifact appears as an ordinary agent-message row carrying an activatable reference that opens it in the library surface. Reason: REQ-CHAT-046 closes the row-category vocabulary, a fourth display mode for one category would need its own expansion, copy, search, and grouping rules, and the library already owns artifact presentation. | REQ-CHAT-056 (amended), REQ-CHAT-046 (confirmed closed) |
| 4 | RESOLVED | Queued prompts are consumed at the end of **every iteration**, not only at natural completion. This is what the product already promises the user in its own words — the panel hint reads "Sent after current iteration" and the toast reads "queued for the next iteration" (REQ-CHAT-035, REQ-CHAT-036) — so completion-only consumption was the incoherent reading. A paused run consumes nothing while it stays paused and picks the queue up at the first iteration boundary after it resumes; queued prompts stay visible and editable meanwhile. The completion guard survives as a consequence: a run may not report completion while prompts remain QUEUED for it. | REQ-CHAT-040 (rewritten), REQ-CHAT-036, REQ-CHAT-035 (cited) |
| 5 | RESOLVED | Exactly-once consumption is guaranteed. The `QUEUED → TRIGGERED` transition is atomic and succeeds for exactly one caller; a second run attempting it observes that the prompt is no longer QUEUED and leaves it alone. No priority or fairness rule is imposed between eligible runs — the winner is whichever run reaches its iteration boundary first — because any other rule would need a total order over runs that nothing else in the product maintains. | REQ-CHAT-038 (amended), REQ-CHAT-041 (amended) |
| 6 | MOOT | The divergence existed only between the terminal frontend and the desktop. REQ-CHAT-115 is withdrawn in the graphical-only sweep; REQ-CHAT-021 is canonical for the product — a submission recognized as a slash command is never forwarded to an agent as prompt content, whatever its outcome. | REQ-CHAT-115 (withdrawn), REQ-CHAT-021 |
| 7 | MOOT | Same shape: the terminal overlay of REQ-CHAT-120 is withdrawn, so there is one suggestion surface and nothing to converge. REQ-CHAT-024 through REQ-CHAT-027 are the whole contract, including prefix-first ranking and unknown-name flagging, which the terminal overlay lacked. | REQ-CHAT-120 (withdrawn), REQ-CHAT-024, REQ-CHAT-025, REQ-CHAT-026, REQ-CHAT-027 |
| 8 | RESOLVED | No reference hardware is named. The budgets are stated as acceptance criteria measured on the machine under test, and the performance-benchmark domain's replay harness (`REQ-UIBENCH-*`) is the authority that accepts or rejects them under its own stated fixture load. A build that misses any budget under that harness fails this domain regardless of its average behaviour. Naming reference hardware would date the specification and would not make the criteria any more checkable. | REQ-CHAT-157 (amended), REQ-CHAT-055 (cited) |
| 9 | RESOLVED | The four highlight colours are bound to named theme roles from REQ-SHELL-145: **resolved** from the readable accent shade; **partial** from that same accent shade blended toward the surface behind it; **unknown** from the `fail` state text colour; argument text from the secondary text colour. Each is then lightened or darkened to clear 4.5:1 against the surface it is painted on, and no two of the four may render identically. Naming roles rather than colours keeps the rule theme-independent while making it testable. | REQ-CHAT-027 (amended) |
| 10 | RESOLVED | The two non-run placeholders are separated by whether a session is loaded, which makes the placeholder track the primary action's own three modes: (3) "Message orchestrator…" whenever a named session is loaded and neither run condition holds — the `Continue run` state; (4) "Describe the outcome you want…" when no session is loaded — the `Start run` state, and the same sentence the empty transcript shows. The four conditions are declared exhaustive and, in order, mutually exclusive. | REQ-CHAT-004 (amended), REQ-CHAT-005 and REQ-CHAT-073 (cited) |
| 11 | RESOLVED | Both requirements were right about different controls, and the contradiction dissolves once they are distinguished. The **composer** chips of REQ-CHAT-009 select what the *next* run starts with and are disabled while a run is under way — starting, running, pausing, paused, cancelling, and the recovery state — and enabled when idle, completed, failed, or cancelled. The **run header's** model and reasoning selectors change the *live* run and follow REQ-CHAT-078's opposite rule, being enabled only while a run is running and locally owned, which is also what REQ-MONITOR-004 requires of a live run. Both requirements now say which control they govern. | REQ-CHAT-006 (rewritten), REQ-CHAT-078 (amended), REQ-CHAT-009 (cited) |
| 12 | RESOLVED | Under the message-text rule the requirement now states information content instead of a fixed string: the reason must convey that the project setup prompt has to be answered before a prompt can be sent, and that nothing else in the application is blocked meanwhile. Wording, punctuation, and sentence count are the implementation's. The obligation to publish the reason through both tooltip and accessible description is unchanged. | REQ-CHAT-007 (amended) |
| 13 | RESOLVED | The vendor-specific placeholder is removed. Until model options have loaded the chip shows a neutral loading label naming no vendor and no model, and is disabled while it shows it, so no run can start against a model the user never chose. A placeholder that names a real model invites exactly that mistake, and a clean-room product has no reason to ship another implementation's model id as furniture. | REQ-CHAT-009 (amended) |
| 14 | RESOLVED | The "Available: …" clause names every configured value, in the order its own catalogue lists them, with no cap. The separator and punctuation are left to the implementation, the clause being read by a person and never parsed; the literal `none` stands in for an empty catalogue as drafted. The same rule is generalized to every argument-taking command by REQ-CHAT-159, which covers `/theme` now that the terminal command is gone. | REQ-CHAT-032 (amended), REQ-CHAT-033 (amended), **REQ-CHAT-159** (new) |
| 15 | RESOLVED | The metadata is already fixed elsewhere and is cited rather than duplicated: a skill is user-invocable exactly when the invocation mode derived by REQ-WORKSPACE-056 and REQ-WORKSPACE-063 is `default` or `manual-only`, and automatic-only when it is `auto-only`. A skill stating neither `user-invocable` nor `disable-model-invocation` derives `default` and is therefore user-invocable — saying nothing gets a skill listed. A skill whose load mode is `off` (REQ-WORKSPACE-062) is absent from the catalogue too, and "skills are turned off" means `skills.enabled` (REQ-WORKSPACE-064). | REQ-CHAT-034 (amended) |
| 16 | RESOLVED | Two-space indentation; the two keys emitted in the order `history` then `stash`; both keys always emitted even when their arrays are empty, so a written file always parses back to the shape it was written from. Two spaces because the file is meant to be diff-friendly and occasionally hand-read, and a fixed key order because a stable byte layout makes an interrupted atomic write easy to reason about. | REQ-CHAT-045 (amended) |
| 17 | RESOLVED | **50** rendered added-or-removed lines, matching the cap the withdrawn terminal requirement used, so one number governs the product. Two further rules from that requirement are rescued into the same place: a tool call that failed to write carries no diff row at all, and an undo renders the diff of the restoration rather than reversing the original row. | REQ-CHAT-050 (amended), REQ-CHAT-133 (withdrawn) |
| 18 | RESOLVED | Parenthetical plural markers are illustrative and are never rendered literally. A single cross-cutting requirement states that any message carrying a count must be grammatically correct for that count, including the singular and the zero case, with wording left to the implementation; the rule is confined to human-readable messages and does not touch machine-readable strings. Stating it once beats editing seven message strings and then re-litigating the eighth. | **REQ-CHAT-168** (new); governs REQ-CHAT-051, REQ-CHAT-072, REQ-CHAT-080, REQ-CHAT-095, and REQ-CHAT-162 (the drafted REQ-CHAT-123, REQ-CHAT-143, and REQ-CHAT-145 instances went with the sweep) |
| 19 | RESOLVED | **10 px horizontally, 5 px vertically.** Rows in a transcript are read as a vertical stream, so the tighter value belongs on the axis that separates one row from the next, and the looser one keeps text off the edge of the transcript area. | REQ-CHAT-057 (amended) |
| 20 | RESOLVED | A `blocked` row renders `blocked · <seconds>s` in the theme's `fail` state text colour, and where the reason is known it is reachable from the row through the expansion of REQ-CHAT-061 and through the row's accessible description. A blocked call is a call that never ran, so showing it as `failed` would misreport it and showing nothing would hide a permission decision the user needs to see. | REQ-CHAT-060 (amended) |
| 21 | RESOLVED | Severity ordering, highest first: **failed, blocked, running, ok**. One failed member colours the whole group as failed however many succeeded; a group with no failure but a blocked member reads as blocked; a group reads as running or ok only when nothing in it went wrong. Running sits below blocked because a call still in flight is not yet bad news, and above ok because a group that is not finished should not read as finished. | REQ-CHAT-065 (amended) |
| 22 | RESOLVED | The collapsed line conveys exactly three facts — the child agent's name, its persona, and its task compacted to at most 110 characters with an ellipsis — with arrangement, separators, and any leading marker left to the implementation. A payload missing a field names the facts it has rather than showing a placeholder, which keeps the degradation rule already in the requirement honest. The 110-character compaction is the figure the withdrawn terminal requirement used and is retained so one number governs child-task summaries. | REQ-CHAT-068 (amended) |
| 23 | RESOLVED | Under the message-text rule, no exact strings. The accessible description must convey which of the two states is current and, while not following, that new output is arriving out of view; wording is the implementation's, provided the two states are never described by the same text. That last clause is the testable part and is what the question was really asking for. | REQ-CHAT-070 (amended) |
| 24 | RESOLVED | Backend ids are **lowercase** hexadecimal, so two ids differing only in case cannot both exist. A temporary client-side id takes the form `local-<n>` with `<n>` unique within the window: it is neither eight characters long nor drawn only from hexadecimal digits, so it cannot be mistaken for a backend id by inspection. A temporary id is never written to the session record and never reaches a model. | REQ-CHAT-089 (amended), REQ-CHAT-153 (amended to name temporary ids as user-only) |
| 25 | MOOT | The question was about spelling a leader chord inside a terminal placeholder and a terminal cheat sheet. REQ-CHAT-104 and REQ-CHAT-151 are withdrawn; the desktop shortcuts of REQ-CHAT-002 are shown by the keyboard help F1 opens, and no chord is substituted into any placeholder. | REQ-CHAT-104, REQ-CHAT-151 (withdrawn) |
| 26 | MOOT | The hint list and the chord set could only disagree while both existed. REQ-CHAT-105 and REQ-CHAT-149 are withdrawn; transcript search is reached on the desktop by Ctrl+F and by the toolbar button (REQ-CHAT-002, REQ-CHAT-074). | REQ-CHAT-105, REQ-CHAT-149 (withdrawn) |
| 27 | MOOT | The warning named a terminal session-creation chord. REQ-CHAT-107 is withdrawn; on the desktop there is no "no session loaded" submission path that records to the transcript and sends nowhere — a submission with no session starts a run (REQ-CHAT-011) or reports why it could not (REQ-CHAT-012). | REQ-CHAT-107 (withdrawn) |
| 28 | MOOT | The terminal stash is withdrawn with REQ-CHAT-113. The product has one stash-append rule, REQ-CHAT-044: into a non-empty composer the entry is appended after one blank line; into an empty composer it replaces the text. | REQ-CHAT-113 (withdrawn), REQ-CHAT-044 |
| 29 | RESOLVED | An unsupplied value expands to the **empty string** in both cases — a `$1`–`$9` for a position that was not supplied and a `$UPPER_NAME` with no matching pair — so a placeholder never leaves its own text in a prompt for a model to read as an instruction. Splitting is on runs of whitespace, except that a span enclosed in matching single or double quotes forms one argument with the quotes removed and inner whitespace preserved; an unterminated quote is treated as closed at the end of the argument string; no other escaping is recognized. Expansion is a single left-to-right pass, so an expanded value is never rescanned. | **REQ-CHAT-161** (new), REQ-CHAT-122 (withdrawn) |
| 30 | RESOLVED | Under the message-text rule the payload is specified by content, not by delimiters: it must identify itself as the body of a skill document, name the skill, name the absolute path it was read from, and carry the file's body verbatim with nothing inserted or removed. Delimiters, labels, and the ordering of the three identifying facts are the implementation's, provided all three are recoverable and the body is unaltered — the literal `[SKILL.md]` marker of the draft is not preserved. | **REQ-CHAT-162** (new), REQ-CHAT-124 (withdrawn) |
| 31 | RESOLVED | **10 seconds** with no provider output of any kind. Below about five seconds the message would fire during ordinary slow generation and cry wolf; much above ten and the user has already begun to wonder whether the application has hung. The indicator reverts as soon as output resumes, appends no row, and never cancels or retries the call — it reports, it does not intervene. | **REQ-CHAT-164** (new), REQ-CHAT-129 (withdrawn) |
| 32 | RESOLVED | The vocabulary is closed to the four values `running`, `ok`, `failed`, `blocked` already fixed by REQ-CHAT-046 and REQ-MONITOR-105. There is no fifth value and no fallback that draws an unrecognized marker as its own literal text — that fallback let arbitrary provider strings into the interface. A row with no status renders no outcome (REQ-CHAT-049); a value outside the four is treated as `failed` rather than displayed. | REQ-CHAT-060 (amended), REQ-CHAT-046, REQ-MONITOR-105 (cited) |
| 33 | MOOT | The question was about terminal right-click copy and its platform-specific clipboard-helper advice. REQ-CHAT-137 is withdrawn. The capability is kept: REQ-CHAT-075 now requires pointer selection across every row category, and requires a copy the platform refuses to be reported as a failure naming what could not be copied — never as a success — with wording left to the implementation. | REQ-CHAT-137 (withdrawn), REQ-CHAT-075 (amended) |
| 34 | MOOT | Both keys existed only to bound a terminal transcript. REQ-CHAT-139 is withdrawn and REQ-CHAT-165 makes bounded residency and on-demand paging product behaviour rather than configuration, so there is no value for a user to put out of range and nothing to clamp, reject, or warn about. | REQ-CHAT-139 (withdrawn), **REQ-CHAT-165** (new) |
| 35 | MOOT | The rule and its two exceptions were about leader chords. REQ-CHAT-152, REQ-CHAT-104, and REQ-CHAT-128 are withdrawn. REQ-CHAT-028 carries the surviving principle on the desktop — every command-palette entry is also reachable as a slash command — and the two actions the question named now have palette entries of their own: reasoning visibility in REQ-CHAT-167, and tool-output visibility in REQ-CHAT-166. There is no multiline toggle to mirror, the composer being multiline in every state (REQ-CHAT-001). | REQ-CHAT-152, REQ-CHAT-104, REQ-CHAT-128 (withdrawn), REQ-CHAT-028, **REQ-CHAT-166**, **REQ-CHAT-167** |

## New requirements added

| ID | Section | Why it exists |
| --- | --- | --- |
| REQ-CHAT-158 | 1. Desktop Composer | Run-timing indicator: per-model-call elapsed while running, frozen at total wall-clock at a terminal state. Rescues REQ-CHAT-105, REQ-CHAT-106. |
| REQ-CHAT-159 | 5. Slash Command Catalogue | Outcome pattern for every argument-taking catalogue command, plus `/theme <name>` and `/logout <provider>`. Rescues part of REQ-CHAT-118; resolves OQ 14. |
| REQ-CHAT-160 | 5. Slash Command Catalogue | Prompt-file commands: three roots in priority order, naming, frontmatter, collision rule. Rescues REQ-CHAT-121; the draft's `~/.codex/prompts/` root is replaced by roots consistent with REQ-WORKSPACE-051. |
| REQ-CHAT-161 | 5. Slash Command Catalogue | Placeholder expansion and positional splitting. Rescues REQ-CHAT-122; resolves OQ 29. |
| REQ-CHAT-162 | 5. Slash Command Catalogue | Skill listing, manual skill loading, and the attached-skill payload. Rescues REQ-CHAT-123, REQ-CHAT-124; resolves OQ 30. |
| REQ-CHAT-163 | 9. Transcript Rendering | Stream-to-display rules and three-shape reasoning recognition. Rescues REQ-CHAT-131. |
| REQ-CHAT-164 | 9. Transcript Rendering | Provider-stall indicator at 10 s. Rescues part of REQ-CHAT-129; resolves OQ 31. |
| REQ-CHAT-165 | 9. Transcript Rendering | Bounded resident rows with on-demand paging from the session record. Rescues REQ-CHAT-140, REQ-CHAT-141, REQ-CHAT-139, REQ-CHAT-126; makes OQ 34 moot. |
| REQ-CHAT-166 | 10. Tool, Thinking, and Grouped Rows | Tool result and input visibility with line caps, in the `display` section of `agents.yaml`. Rescues REQ-CHAT-132 and the `/tools` capability of REQ-CHAT-118. |
| REQ-CHAT-167 | 10. Tool, Thinking, and Grouped Rows | Global reasoning-visibility preference, default off, in the desktop preference store. Rescues REQ-CHAT-128. |
| REQ-CHAT-168 | 27. Cross-Cutting Invariants | Parenthetical plural markers are illustrative; counted messages must inflect. Resolves OQ 18. |
| REQ-CHAT-169 | 29. Image Attachments | The attachment surface: drag-and-drop and file picker, the ordered removable list, and submission carrying text and attachments as one prompt. Resolves OQ 2. |
| REQ-CHAT-170 | 29. Image Attachments | Accepted media types, per-file and per-submission ceilings, and the rejection report. Resolves OQ 2. |
| REQ-CHAT-171 | 29. Image Attachments | The model-capability gate: attachment affordances are enabled only for a model that announces image input. Resolves OQ 2. |
| REQ-CHAT-172 | 29. Image Attachments | Model selection while attachments are held: no silent selection that would discard them. Resolves OQ 2. |
| REQ-CHAT-173 | 29. Image Attachments | Storage under the session directory, reference by path and digest in the snapshot, and re-projection on reopen. Resolves OQ 2. |
| REQ-CHAT-174 | 29. Image Attachments | Token estimation counts attachments, and marks the estimate a lower bound where the model declares no image cost. Resolves OQ 2. |
