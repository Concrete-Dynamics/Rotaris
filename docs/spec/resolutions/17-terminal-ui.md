---
reference: ROTARIS-CRW-001
domain: terminal-ui
date: 2026-08-30
status: resolved
---

# Open-question resolutions — Interactive Terminal UI (domain 17, `REQ-TUI`)

This record disposes of every open question raised by the draft of
[`../17-terminal-ui.md`](../17-terminal-ui.md). It was written under the product-owner decisions
recorded on 2026-08-30:

1. **Compatibility ambition is behavioral inspiration only.** The rewrite owes no format, command
   surface, exit code, or event vocabulary to any other implementation. Under-determined cases are
   decided here rather than preserved.
2. **Defect policy: omit what conflicts.** Internal contradictions are resolved toward the reading
   that is most coherent with the rest of the document; where no coherent reading exists the
   behavior is omitted rather than reproduced.
3. **Unbuilt-but-intended behavior is in scope.** A requirement is not dropped merely because it
   describes intent.
4. **The product is one Electron desktop application**; it has no command-line interface and no
   terminal user interface. This domain is retired — removed, not deferred — and every `REQ-TUI`
   identifier is withdrawn in place, never renumbered or reused. The dispositions below are kept as
   the historical record of how the domain stood when they were taken; each capability a user
   reached through the terminal interface is carried by a desktop requirement in the domain that
   owns it.
5. **Message text is specified by information content, not wording**, except where a string is part
   of a machine-readable contract.

Dispositions: **RESOLVED** (decided here and written normatively into the spec), **OMITTED**
(withdrawn or narrowed), **ESCALATED** (a product decision left to the product owner and restated
in the spec's Open Questions section).

| OQ # | Disposition | Decision taken | Requirements touched |
| --- | --- | --- | --- |
| 1 | RESOLVED | Answered by the product owner on 2026-08-30 and recorded in [`../../clean-room/specification-gate.md`](../../clean-room/specification-gate.md): detaching a live run is **not specified here**. REQ-TUI-152 states stop-persist-and-notify and nothing more, and this domain is retired, so nothing further is owed against a `REQ-TUI` identifier. The desktop action that does detach a live run — the run continuing in the same process, `execution_status` persisted as `background` at the hand-off, and the refusal when there is no run to send — is carried by REQ-SESSION-190, and is domain 07's to state, not this document's. | REQ-TUI-152 (unchanged); carried on the desktop by REQ-SESSION-190 |
| 2 | RESOLVED | The right rail is 3:2:2 (agents:info:todo), matching the drafted REQ-TUI-016; 2:1:1 is rejected because the info and todo panels each need more than a quarter of the rail once metric rows, MCP, tools, artifacts, and warnings share the info panel. Both the 7:3 column split and the 3:2:2 rail split are fixed and not configurable. | REQ-TUI-016 |
| 3 | RESOLVED | The quit grace period is 2.0 s, not 5.0 s: it is the value the user-facing shutdown message, the agent activity text, the countdown of REQ-TUI-129, and the constants list all already state, so 2.0 s is the only reading that leaves the document self-consistent. | REQ-TUI-128, REQ-TUI-129, REQ-TUI-206 (confirmed; no text change) |
| 4 | RESOLVED | The info panel shows no todo summary block. Todos appear in exactly one place, the todo panel. REQ-TUI-102 now closes the info panel's section list so a future block cannot be added silently. | REQ-TUI-102 |
| 5 | RESOLVED | Exactly one command-palette surface exists: the modal of REQ-TUI-056. No terminal-framework-native palette is exposed, since a second surface would duplicate entries, own its own focus rules, and break the "opens from leader `p` and the meta-bar segment and from no other affordance" guarantee. | REQ-TUI-056 |
| 6 | RESOLVED | Cross-emulator appearance is a verification activity, not a specification gap; what the draft owed was a capability baseline, and REQ-TUI-207 was minted to state one. That identifier is **withdrawn**: the `REQ-TUI` series was already closed when the resolution pass ran, and a terminal display baseline has no surface in a product that is one desktop window. The equivalent guarantee — a stated minimum size at which the whole working surface stays usable, and a layout that degrades at stated thresholds rather than fails — is carried by REQ-SHELL-061, REQ-SHELL-059 and REQ-SHELL-047, with the contrast floors in REQ-SHELL-145. | REQ-TUI-207 (withdrawn) |
| 7 | RESOLVED | The OSC 52 fallback keeps reporting success — the sequence cannot be acknowledged, and a failure report would be equally unverified — but its notification must say that the copy was handed to the terminal without confirmation, so the unverified case is distinguishable from a verified tool copy. Wording is left to the implementation. | REQ-TUI-195 |
| 8 | RESOLVED | Catalog contents and error shapes stay provider-dependent, but the unbounded wait they implied is closed: per-provider runtime discovery is bounded by a 10 s timeout, after which that provider contributes a collected timeout message and the table renders from whatever else resolved. The status line therefore always leaves "Loading provider catalogs…" within a bounded time. | REQ-TUI-157, REQ-TUI-206 |
| 9 | RESOLVED | The constants of REQ-TUI-206 are normative and no further timing requirement is added; the one substantive gap — backlog behavior under sustained load — is closed in REQ-TUI-080: at most one deferred redraw is ever pending, so update bursts coalesce instead of accumulating. Perceived feel on real hardware is a verification activity. | REQ-TUI-080 |
| 10 | RESOLVED | Proportional scrolling is replaced rather than given a tolerance: choosing a search result scrolls so that the matched event's first rendered row is the topmost visible row (clamped to the maximum offset), which is exact, needs no rounding rule, and removes the accuracy question entirely. | REQ-TUI-189 |
| 11 | RESOLVED | The provider settings screen auto-opens for exactly three problems: no stored credential for a provider a configured model references; a stored credential the provider refused as invalid, revoked, or expired; and a required connection value (key or base URL) left unset. Network failures, timeouts, quota and rate-limit conditions, unknown model ids, and interactive-login providers raise the toast only. | REQ-TUI-010 |
| 12 | RESOLVED | The configuration-less fallback uses the same defaults as configuration — tool results shown, tool inputs shown, 10 and 2 line limits — so what a user sees does not depend on whether a config file happens to exist. The differing hidden default is dropped. | REQ-TUI-069 |
| 13 | RESOLVED | Session locking is defined: the lock is exclusive per session id, acquisition is immediate (it never waits, blocks, or retries), a second attaching process fails with the lock-conflict error and loads nothing, the lock is released on process exit, and a lock whose owning process is no longer alive is treated as free and taken over. | REQ-TUI-151 |
| 14 | RESOLVED | The single automatic recovery attempt is made only when every collected failure is a missing artifact the launcher owns (workspace `.rotaris/`, workspace `agents.yaml`, global `agents.yaml`); it creates them with documented defaults and reloads. Parse failures and validation failures are never repaired and load exactly once. Recovery is user-visible: one stderr line per artifact created. | REQ-TUI-005 |
| 15 | RESOLVED | A SIGINT arriving other than as a key press is always a graceful quit request attributed to "SIGINT"; the pending-chord and copy-selection branches depend on keyboard state and apply only to the Ctrl+C key press. | REQ-TUI-011, REQ-TUI-033 |
| 16 | RESOLVED | A session is stale exactly when its recorded status implies a live owner (`running`, `waiting`, `background`) while no live process holds its lock. `interrupted` is admitted as a full member of the execution-status vocabulary rather than a listing-only value, so one vocabulary covers listing, repair, and display. | REQ-TUI-012, REQ-TUI-124 |
| 17 | RESOLVED | First-run preparation creates the global configuration directory, performs the one-time legacy-directory adoption, creates a default global `agents.yaml`, and creates the workspace `.rotaris/` and `.rotaris/sessions/` directories. It keeps no marker file: a later invocation finds those artifacts present and does nothing. It never overwrites existing content. | REQ-TUI-013 |
| 18 | RESOLVED | Run-completed toast severity is a total mapping over the execution statuses: `idle` and `background` are information, `paused`, `paused_message_limit`, `stopped`, `waiting`, and `interrupted` are warning, `failed` is error. Lifetime is the 8 s default, 10 s for error severity, matching the scheduler-issue rule. | REQ-TUI-022, REQ-TUI-206 |
| 19 | RESOLVED | A measurable floor is set as WCAG 2.1 relative contrast against the background a value is drawn over: 4.5:1 for the normal foreground and every accent used for text, 3.0:1 for the muted, dim, and subtle foregrounds, 3.0:1 for border roles and for any glyph that carries state meaning alone. A palette missing a floor is not a valid built-in theme. | REQ-TUI-025, REQ-TUI-204 |
| 20 | RESOLVED | The help screen lists both: the built-in commands in the order of REQ-TUI-047, then, only where any exist, a separately headed section of the commands registered at runtime from skills and prompt files, in registration order. Separate headings keep built-in and registered commands distinguishable. | REQ-TUI-036 |
| 21 | RESOLVED | The status word tracks run state. The segment renders `$ <state>` where `<state>` is the current execution status of REQ-TUI-124, with `idle` and the pre-session condition both shown as `ready` and every other status shown under its own name — so there is one vocabulary, not a second set of display words to keep in step. | REQ-TUI-042 |
| 22 | RESOLVED | Skills are discovered from exactly two roots, walked recursively in order: `<workspace>/.rotaris/skills/` then `<global config dir>/skills/`, first discovery winning a contested command name. `<scope>` is exactly one of `project`, `user`, `session`, the last being a skill loaded by `/skill <path>` from outside both roots. | REQ-TUI-054 |
| 23 | RESOLVED | A prompt file with no `description` frontmatter displays `Prompt: <name>` using its normalized command name; a missing `argument-hint` drops the hint and the space before it, so the description simply ends. | REQ-TUI-055 |
| 24 | RESOLVED | The "animated marker" concept is removed rather than enumerated. Animation follows the entry's phase: an entry that has not reached a terminal phase renders the braille frame whatever marker it reports, and the marker mapping applies only to terminal entries. This also removes the possibility of a finished entry animating forever. | REQ-TUI-067 |
| 25 | RESOLVED | Paged-in events win. The memory trim considers only events the running session appended and never evicts archive-restored events, so the in-memory count may exceed the cap while the reader is scrolled back; restored pages are released back to placeholders when the transcript returns to follow mode at the bottom, restoring the bound. | REQ-TUI-083, REQ-TUI-085, REQ-TUI-136 |
| 26 | RESOLVED | The cap of 5 concrete rows is authoritative and the focus window is 2 rows above and 2 below the focused row. The cap is the harder constraint (it bounds the panel's height budget), and a 5-row window keeps the focused row centered. | REQ-TUI-088, REQ-TUI-206 |
| 27 | RESOLVED | A cancelled agent shows the chip `canc` in purple, matching the purple the top-bar badge already gives cancelled in REQ-TUI-099; the `idle` fall-through no longer swallows a state the rest of the document treats as terminal. | REQ-TUI-091 |
| 28 | RESOLVED | Cost renders in US dollars with a leading `$`: two decimals at $0.01 and above, four decimals for smaller non-zero amounts, `$0.00` for exactly zero. Where no cost can be known the line is omitted entirely rather than displayed as zero or unknown. | REQ-TUI-105 |
| 29 | RESOLVED | ` edited` marks exactly a body changed through the inline editor after creation, is persisted with the artifact so it survives run end and reload in a later process, and is never raised by an agent's own modifications — it tells the user which artifacts they themselves touched. | REQ-TUI-109 |
| 30 | RESOLVED | The todo body renders all four markers with the summary's colors: `[x]` completed (blue), `[>]` in progress (green), `[ ]` pending (subtle), `[-]` abandoned/failed (red), so every counted state is identifiable in the body by text alone. | REQ-TUI-112 |
| 31 | RESOLVED | `<intent>` is one of the thirteen taxonomy categories already fixed by REQ-ORCH-006 (`explicit_trivial` … `ambiguous`); this domain adopts that vocabulary rather than inventing a second one. The final status text is the `Intent classified: <intent>` line plus whichever suffix REQ-ORCH-014 defines (carried-over, or fallback with reason), and the unsuffixed line where neither case applies. | REQ-TUI-116 |
| 32 | RESOLVED | The permission-mode vocabulary is the three presets of REQ-TOOLS-041 — `restricted`, `ask`, `autonomous` — and only `autonomous` is affected by the reduction. The opt-in is the existing workspace key `runtime.allow_unsandboxed_autonomous` (default false) of REQ-TOOLS-068; no new configuration key is introduced. | REQ-TUI-119 |
| 33 | RESOLVED | The execution-status vocabulary is closed. Progress summarization records only statuses already listed (in practice `idle`, `stopped`, `failed`) and may not contribute one of its own; `interrupted` is added to the list for open question 16 rather than left outside it. | REQ-TUI-124 |
| 34 | RESOLVED | The "first" active child is the first active agent in the flattened tree order of REQ-TUI-089 — the topmost active row the agents panel shows — so the recipient of an unfocused steering prompt is deterministic and matches what the user sees. | REQ-TUI-130 |
| 35 | RESOLVED | Duplicate suppression of scheduler-issue toasts resets per run: the record clears when a run starts, so one report per issue per run. Per-iteration would be noisy for a problem that persists across iterations; per-session or per-process would silence a genuine recurrence in a later run. | REQ-TUI-137 |
| 36 | RESOLVED | The sanitizing pass makes exactly three changes: undecodable bytes become the Unicode replacement character (the delta is not dropped), terminal escape sequences are removed so streamed output cannot address the terminal, and C0/C1 control characters other than newline and tab are removed. All other characters, whitespace included, pass through untouched. | REQ-TUI-145 |
| 37 | RESOLVED | Reasoning fragments extracted from one delta are joined with a single newline, the same separator REQ-TUI-145 uses for content parts, so block boundaries survive into the rendered body. | REQ-TUI-146 |
| 38 | RESOLVED | The slider range becomes 5..100 with step 5, so every reachable value is a multiple of 5 and both ends are reachable exactly. A configured value that is not a multiple of 5 displays as configured and snaps to the nearest multiple in the direction pressed on first adjustment. | REQ-TUI-164, REQ-TUI-206 |
| 39 | RESOLVED | Exactly one separator is inserted between existing composer text and a popped entry: a single space in inline mode, a single newline in multiline mode — matching the mode's own notion of a line and the collapse rule of REQ-TUI-039. | REQ-TUI-175 |
| 40 | RESOLVED | The difference is not intended and is removed: artifact-focus keys act while the composer holds focus exactly as agent-focus keys do, leaving text and caret untouched, whether or not the inspector is open. Navigation keys now behave alike, and no key that is not a text character is silently swallowed by the composer. | REQ-TUI-032, REQ-TUI-177, REQ-TUI-180 |
| 41 | RESOLVED | Multi-line text collapses: every run of whitespace, line breaks included, becomes a single space and the ends are trimmed, then the 80-character cut applies. Keeping only the first line would hide matches the search itself reported. | REQ-TUI-187 |
| 42 | RESOLVED | The surfaced problem is chosen deterministically, as REQ-TUI-205 requires: error severity ahead of warning; within a severity, by the startup model slot that referenced the provider in the slot order of REQ-TUI-008; ties broken by provider name in ascending code-point order. "Any one of them" was rejected because it would make startup non-reproducible. | REQ-TUI-010 |
| 43 | RESOLVED | The repair report goes to stderr — one line per changed session naming its id and new status, then one line giving the count — so stdout stays a pure, parseable listing per REQ-TUI-013; the listing itself shows the repaired status because repair runs before printing. | REQ-TUI-012 |
| 44 | RESOLVED | Modifiers are ignored entirely when matching a chord: any combination of Ctrl, Alt, Shift, and Meta with a mnemonic performs that chord. Only a keystroke whose base character is not a mnemonic falls to the "any other key" rule, so a user holding a modifier from the leader keystroke never silently loses the chord. | REQ-TUI-031 |
| 45 | RESOLVED | Standard error is never parsed. Outcomes are decided by exit code and stdout alone: exit 0 with non-empty output gives the branch (literal `HEAD` giving `[detached]`), and every other outcome — empty output, any non-zero exit, spawn failure, timeout — hides the branch and its separator. This removes all dependence on an external tool's message wording, version, and locale. | REQ-TUI-193 |

## Escalations answered

One question was escalated: whether `/background` should detach a live run into a background process,
or remain a save-and-notify convenience. It was answered by the product owner on 2026-08-30 and the
answer is recorded in [`../../clean-room/specification-gate.md`](../../clean-room/specification-gate.md):
detaching is not specified here, REQ-TUI-152 states stop-persist-and-notify and nothing more, and this
domain is retired. No question raised against this document remains open.

REQ-TUI-152 keeps the form the resolution pass gave it: the active run is interrupted gracefully before
the session is marked `background`, so no streaming preview or unfinished tool entry survives a status
the rest of the document treats as non-running, and the toast advertises no unbuilt capability. Genuine
detachment of a live run is a desktop behavior and is stated by REQ-SESSION-190.

## Identifier series closed

`REQ-TUI` is closed and no further identifier may be added to
[`../17-terminal-ui.md`](../17-terminal-ui.md). REQ-TUI-207, minted by this pass after the retirement
decision, is withdrawn on that ground (OQ 6); it is the only identifier this pass added, so the series
ends at REQ-TUI-207 with that entry withdrawn.
