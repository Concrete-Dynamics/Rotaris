---
reference: ROTARIS-CRW-001
domain: git-worktrees-checkpoints
date: 2026-08-30
status: resolved
---

# Open-Question Resolutions — Git Integration, Worktrees, and Checkpoints


> ## Amendment, 2026-10-13 — a session storage directory that contains the requirement checkout container (OQ-263)
>
> `REQ-GIT-138` gains a dated note beneath its text, which is kept unchanged. In its first sentence, "the directory of
> another" means a worktree directory of another namespace, or the fixed requirement checkout container `REQ-GIT-137` names
> (`<workspace>/.rotaris/requirements/worktrees/`), and not every directory that encloses it; a `worktree_storage_subpath` of
> `requirements` or `.`, whose session directory contains that container, loads, and the directory-side rejection is exactly
> the one the requirement states (the container itself, or a directory inside it).
>
> **Why this is a note and not a directive.** The requirement's two sentences read differently over those two values, and
> `REQ-GIT-130`'s own layout — the integration container `integrations/` inside the session storage directory — shows that
> namespace containers nest by design. Nothing the product does changes. Ruled under the owner's delegation
> ([R-072](../../product/requests.md#r-072)), confirmed as built; the ruling, with its caveat on session ids, is in
> [`open-questions.md`](../../architecture/open-questions.md#oq-263).

> ## Superseded by the storage rulings (2026-09-01)
>
> The product owner's rulings **SR-4** to **SR-8** and **ESC-11**, **ESC-13**, **ESC-15**, **ESC-16** and
> **ESC-18** (`../../architecture/owner-decisions.md`) moved session-owned data out of files and into a
> machine-local durable store, made the workspace store machine-local, extended the export obligation, and
> corrected two defects. Dispositions below that were **argued from the file-based model** are recorded
> here as superseded so no future reader treats a stale rationale as settled. **Each disposition's outcome
> stands unless this block says otherwise; what changed is the reasoning, the medium, or the vocabulary.**
>
> - **OQ 10** and **OQ 14** reason about the session **lock file** and its `host` field. The lock is now a
>   record held with the session (REQ-SESSION-046, REQ-GIT-020); the `pid`/`host`/`acquired_at` field set,
>   the single-retry reap, and the resolve-ambiguity-toward-live rule are all unchanged. What changed is the
>   medium and, under **SR-5**, what a refusal must **convey**: where the lock names another machine the
>   refusal must say the session is held by a different machine, not report a lock conflict
>   (REQ-SESSION-048). Under **ESC-15** a foreign-host lock is no longer the ordinary consequence of shared
>   storage but evidence that the session store itself is reachable from more than one machine.
> - **OQ 23**'s "no session directory and no lock are created" is now "no session record and no lock are
>   created". The refusal semantics are unchanged.
> - The **integration lock** (REQ-GIT-128) deliberately stays a file at `<workspace>/.rotaris/`. It is the
>   one lock in the product that is not machine-local, because what it protects is the user's own base
>   repository, which travels with the workspace.
>   >
>   > **Still true, and incomplete after ESC-21 (2026-09-01).** The lock stays where it is for exactly
>   > the reason given, and every sentence of REQ-GIT-128's case for it is preserved. What the note
>   > omits is the boundary within which the cross-machine guarantee is actually true. Exclusive create
>   > is a genuine primitive on a network filesystem and is **not** one inside a file-synchronisation
>   > agent's tree, because such an agent replicates after creation: both machines create the lock
>   > locally, both succeed, and both believe they hold it. The product therefore does not promise
>   > mutual exclusion it cannot enforce — on storage classified as file-synchronisation-replicated
>   > (REQ-STARTUP-166) the integration is **refused before anything is attempted** and the lock is not
>   > created at all, as a pre-work refusal under REQ-GIT-157 and second in REQ-GIT-124's ordered list.
>   > REQ-GIT-145's one-integration-per-workspace limit is correspondingly no longer asserted on a lock
>   > that does not lock. The **strength** of that response — refusal against a proceed-past warning —
>   > is what spike 19 decides; the direction is settled and the spike does not reopen it.
>   >
>   > Domain 06 states no storage test of its own: the classification is REQ-STARTUP-166's and is not
>   > made a second time here. An unclassifiable or not-yet-determined answer does **not** refuse,
>   > because an inconclusive answer is a silent negative in REQ-STARTUP-166 and stays one here; that is
>   > why REQ-GIT-150's "every ambiguity about liveness resolves toward refusal" is now bounded so the
>   > two rules cannot appear to conflict.


This record disposes of every open question raised in the draft of
[`../06-git-worktrees-checkpoints.md`](../06-git-worktrees-checkpoints.md) (domain 06, requirement
prefix `REQ-GIT`). The body of that specification has been amended so that each decision below is
stated normatively in place; the numbering of the original open questions is preserved here so the
draft and the resolved specification can be read against each other.

The following product-owner decisions of 2026-08-30 governed the dispositions:

1. **Compatibility ambition is behavioral inspiration only.** No obligation to match any other
   implementation's formats, command surface, exit codes, or event vocabulary. Under-determined
   cases are decided here on their merits, never preserved for compatibility.
2. **Defect policy: omit what conflicts.** Internal contradictions are resolved toward the reading
   that is more coherent with the rest of the document; where no coherent reading exists, the
   behavior is withdrawn rather than reproduced.
3. **Unbuilt-but-intended behavior stays in scope.** A requirement is not dropped merely because it
   describes intent.
4. **The product is one Electron desktop application.** It has no command-line interface and no
   terminal user interface — removed, not deferred. Domains 17 and 18 are retired and the `REQ-TUI`
   and `REQ-CLI` identifiers are withdrawn, so no requirement here cites them. See the
   graphical-only sweep below for what that did to this domain. Running external programs stays
   fully in scope: version-control invocations, worktree creation and checkpoint capture are all
   things the application does, not ways a user drives it.
5. **Message text states required information content, not exact wording**, except where a string is
   part of a machine-readable contract (an event field value, an enum, or a parseable output
   format). Open questions asking only about phrasing, punctuation, or inflection of a human-readable
   message are resolved by fixing the information the message must carry and leaving the wording to
   the implementation.

New requirements added by these resolutions: **REQ-GIT-152** through **REQ-GIT-156**. No requirement
identifier was renumbered, reused, or deleted.

## Dispositions

| OQ # | Disposition | Decision taken | Requirements touched |
| --- | --- | --- | --- |
| 1 | RESOLVED | Visual appearance is deliberately unconstrained, not undetermined. The specification fixes structure, labels, minimum sizes, accessible names, and state transitions; colours, spacing, typography, theming, and icon glyphs are governed by the approved design reference and cannot fail a conformance check of this domain. The few visual properties a requirement does name (monospace sync label, monospace preview field, danger styling, local-commit tint) remain binding. | REQ-GIT-152 (new) |
| 2 | RESOLVED | The 300 s tree-walk limit is the whole budget, not a target: a repository too large to stage inside it produces the REQ-GIT-033 timeout error, which is a correct outcome rather than a defect. There is no preview-on-selection flow to budget — selecting a checkpoint row computes nothing; a preview is computed only when "Restore checkpoint" is pressed, behind the progress dialog, bounded by the REQ-GIT-033 limits. | REQ-GIT-033, REQ-GIT-096 |
| 3 | RESOLVED | No ordering between asynchronous interface updates is required beyond the 120 ms debounce, the 150 ms retry, the settle-exactly-once rule, and the REQ-GIT-121 branch-before-output ordering. Instead a stronger, order-free rule is stated: every asynchronous result is applied only to the surface it names and is discarded when it names a session, sequence, or workspace that is no longer selected, so any interleaving leaves the view coherent. | REQ-GIT-082 |
| 4 | RESOLVED | Agent conduct is explicitly outside the domain: no requirement constrains conflict-resolution quality or iteration count, and conformance is judged on the instruction text plus the promotion gates, which leave the base untouched whenever the agent fell short. Stated normatively rather than left as an open note. | REQ-GIT-132 |
| 5 | RESOLVED | The liveness probe asks one question — does a process bearing the recorded pid exist on this machine now — and never tries to confirm process identity. A recycled pid, a platform still reporting an exited process, and (via a new `host` field in the lock file) a lock taken on another machine all answer "live", so every residual case resolves toward refusal by construction. A cross-host lock is never reclaimed automatically. | REQ-GIT-020, REQ-GIT-028, REQ-GIT-093, Data & Formats (lock JSON) |
| 6 | RESOLVED | Yes. A commit is flagged local exactly when it is not reachable from the checked-out branch's upstream — the merge-base computation — never by its position in the listing, so a listing whose order differs from the divergence order stays correct. No upstream, or a detached HEAD, flags nothing. | REQ-GIT-108 |
| 7 | RESOLVED | Both desktop-only preferences live in the desktop application's user-scoped preference store under `desktop.git.post_merge_cleanup_prompt` (boolean, default true) and `desktop.git.view_split_ratio` (number 0.2–0.8, default 0.5). User-scoped, not workspace-scoped; never under `.rotaris/`; never part of the layered YAML surface. Missing values load as the default; an out-of-range ratio is clamped. | REQ-GIT-153 (new), REQ-GIT-076, REQ-GIT-135 |
| 8 | RESOLVED | Yes to both. A three-code contract is stated for the whole domain: 0 = did what was asked (including benign no-op outcomes), 2 = refused before any work, on arguments/configuration/state (leaves no session directory, lock, or modified file), 1 = accepted then refused or failed. Every domain usage refusal shares code 2. | REQ-GIT-154 (new), REQ-GIT-021, REQ-GIT-026 |
| 9 | RESOLVED | Yes, the sibling default is kept and made exact: the Directory field derives as `<parent of workspace>/<branch with each `/` replaced by `-`>`, re-deriving as the branch is typed and freezing once the user edits it by hand. A manual worktree is the user's own checkout and belongs beside the project; only session isolation, integration, and requirement execution use `.rotaris/` storage. | REQ-GIT-115 |
| 10 | RESOLVED | The `main`-or-`master` rule is withdrawn. The base tree is the repository's main working tree — the one checkout that is not a linked worktree — so exactly one row is always the base tree and a repository with a differently named trunk behaves identically. The base branch is whatever the base tree has checked out; when the base tree is detached there is no base branch and the divergence figures take the empty value of REQ-GIT-112 instead of an approximation. | REQ-GIT-106, REQ-GIT-107 |
| 11 | RESOLVED | Per the message-text decision: the status bar must convey the workspace path and the branch state as separately identifiable pieces, and a path too long for the width must be shortened so its final component stays visible. Ordering, separators, and the manner of shortening are left to the implementation. | REQ-GIT-123 |
| 12 | RESOLVED | The dialog enforces the whole rule set. REQ-GIT-009 is the single source of truth for branch-name acceptance, so the desktop pre-validation accepts a name exactly when creation would; `@{`, `//`, and a path component starting with `.` are now refused in the dialog. The distinct message categories are kept but stated as required information content. | REQ-GIT-110, REQ-GIT-116 |
| 13 | RESOLVED | Yes, the same text. The worktree layer reports `Git timed out after 30s: <command>`, the identical form REQ-GIT-033 uses and with the same `<command>` rendering, so one timeout text serves the whole domain. | REQ-GIT-013 |
| 14 | RESOLVED | The refusal conveys that the session is already held by a live run and names the session id, the recorded pid, and the recorded host so the holder can be found; wording is left to the implementation. Nothing runs and the lock file is left untouched. Exit code 1, not 2: the invocation itself was well formed, so it falls on the "accepted then refused" side of the REQ-GIT-154 contract. | REQ-GIT-020, REQ-GIT-154 (new) |
| 15 | RESOLVED | Each report line conveys the session id, the previous status, the new status `interrupted`, and the reason it counted as stale; the no-stale-session output conveys that nothing needed repair; the listing marks a stale session so it cannot be mistaken for a running one. All three wordings are left to the implementation. `--repair` also deletes the orphaned lock file, so it leaves a session in exactly the state the desktop repair of REQ-GIT-094 does. | REQ-GIT-028 |
| 16 | RESOLVED | Rename detection is enabled at a 50 per cent similarity threshold; copy detection is disabled. `A`, `D`, `M`, and `R` are therefore the only statuses a preview can carry, and a copied file reports as an addition. The unknown-letter fallback of REQ-GIT-039/063 is kept as a defence against a future Git, not as a live case. | REQ-GIT-039 |
| 17 | RESOLVED | Divergence is possible, so the safe reading is canonical. REQ-GIT-049 now guarantees only that no operation of this domain leaves a record without its ref; a ref removed from outside can still diverge, which is why gate 2 exists. Automatic numbering therefore adopts the REQ-GIT-059 rule — maximum of recorded sequences and live refs, plus one — so one numbering rule governs the whole domain. | REQ-GIT-046, REQ-GIT-049 |
| 18 | RESOLVED | The unknown-session refusal must convey the session id as supplied and that the session store holds no session under it, so nothing can be previewed or restored; wording left to the implementation, subject to REQ-GIT-151's requirement that it read as a distinct sentence from the other refusals. | REQ-GIT-054 |
| 19 | RESOLVED | The lookback is extended rather than the force prompt accepted. A new persisted session field records the last successfully restored sequence, and the drift candidate set becomes the 10 most recent recorded checkpoints plus that checkpoint, so undoing a rollback never demands force however far back the target lay. | REQ-GIT-155 (new), REQ-GIT-056, REQ-GIT-149 |
| 20 | RESOLVED | Dirty-reason paths are delimited by `, `; the two sentences are joined by exactly one space; ascending path order means ascending byte order of the UTF-8 encoding, everywhere in the domain. For the table, the widths 4/25/4/5 are kept, the separator is exactly one space, the heading row is padded like a data row, and the literal heading string quoted in the draft is declared not normative — the contradiction is resolved by dropping the string, not the widths. An over-wide value is written in full and shifts that line's later fields right. CREATED is UTC, ISO-8601, seconds precision. | REQ-GIT-057, REQ-GIT-064, Data & Formats (shared textual formats) |
| 21 | RESOLVED | When a preview has no entries but carries a blocked reason, the blocked reason alone is the whole text, on one line; neither the `would change` line nor the `would change nothing` line is produced, because nothing is known about what the restore would do. | REQ-GIT-064 |
| 22 | RESOLVED | `--workspace/-w` defaults to the process's current working directory, and the value names the base workspace whose `.rotaris/sessions/` holds the session, never a session's worktree. The same default applies wherever the flag appears. | REQ-GIT-065, REQ-GIT-066 |
| 23 | RESOLVED | One rule for every rejected configuration value in the domain: the load fails as a whole, no default is substituted and no value repaired, nothing depending on it starts, no session directory or lock is created, and the failure is reported on the surface that asked for the load — stderr with exit 2 on the CLI, an actionable error in the desktop, which keeps running with no workspace configuration loaded. The report conveys key, rejected value, and constraint; wording left to the implementation. | REQ-GIT-071, REQ-GIT-138, REQ-GIT-154 (new) |
| 24 | RESOLVED | The selection stays eligible, the merge order carries the eligible rows only, and the ineligible ones are not dropped silently: the merge-order dialog lists only eligible rows and states how many were left out and why. | REQ-GIT-083, REQ-GIT-125 |
| 25 | RESOLVED (with one omission) | A row's Ahead and Behind count against the base branch of REQ-GIT-106, never against an upstream; the upstream counters stay on the header sync label alone. REQ-GIT-105's collection list now includes those per-worktree counts, and REQ-GIT-077 gains a `Behind` column so every numeric figure a row carries has somewhere to appear. The agent commit count is OMITTED: REQ-GIT-144 fixes agent commits to the repository's own configured identity, so an agent commit is by construction indistinguishable from a user commit and no such count can be derived. | REQ-GIT-077, REQ-GIT-085, REQ-GIT-105 |
| 26 | RESOLVED | Abbreviated hash = first 8 characters of the 40. The uncommitted-path count includes untracked paths, matching REQ-GIT-014 so the count and the cleanliness gates never disagree. Age ladder: under a minute reads "just now", then minutes to 59, hours to 23, days to 29, months of 30 days to 11, then years of 365 days — largest unit whose count reaches 1, one unit only; inflection and phrasing left to the implementation. On a detached HEAD the listing walks from HEAD. | REQ-GIT-105 |
| 27 | RESOLVED | Force is never offered up front. Deletion is always attempted without force; only when Git refuses because the worktree holds modified or untracked files does a second confirmation appear, stating that the work will be discarded permanently and offering a destructive confirm beside a defaulted Cancel. Any other failure goes straight to the error dialog, since force would not have helped. | REQ-GIT-111, REQ-GIT-117 |
| 28 | RESOLVED | By an explicitly configured command and nothing else. A new key `integration.validation_command` (string or null, default null) is quoted literally into the instruction text; when null the validation clause is omitted entirely and no validation runs. No file sniffing, no agent judgement, and no promotion gate depends on it — so the instruction text stays checkable by reading it alone. | REQ-GIT-156 (new), REQ-GIT-132 |
| 29 | RESOLVED | A failed fast-forward after every gate passed is treated exactly as a failed gate: promotion failure, base branch and base tree untouched, sources set to `merge_failed`, integration worktree retained. The error conveys that the base could not be advanced and was left untouched, carrying the Git failure text verbatim as its detail; surrounding wording left to the implementation. Fast-forward-only means the base is never left partly moved. | REQ-GIT-133 |
| 30 | RESOLVED | The check runs against a rendered example name, not the literal template prefix: every placeholder is substituted with a fixed sample, slugged and assembled as a real name would be, and the result tested for the forbidden prefixes — so a template that reaches a forbidden namespace only after substitution is caught. Rejection texts convey key, value, colliding namespace, and (for a template) the rendered example; wording left to the implementation, process behaviour per the OQ 23 rule. | REQ-GIT-138 |
| 31 | RESOLVED | Slug rule fixed: fold to lower case; replace each maximal run of characters outside `a-z 0-9 . _ -` with a single `-`; strip leading and trailing `-` and `.`; truncate to 40 characters and strip a trailing `-` or `.` left by the truncation; an empty result becomes `x`. Both suffixes may appear on one name, cycle before attempt (`-c2-a3`), appended after slugging and never themselves slugged. | REQ-GIT-139 |
| 32 | RESOLVED | Each attempt's directory is named for that attempt's own rendered branch name, cycle and attempt suffixes included, with each `/` replaced by `-`, directly under `<workspace>/.rotaris/requirements/worktrees/`. Uniqueness follows from REQ-GIT-139 plus the collision resolution of REQ-GIT-010, so no derivation of its own is needed; an existing directory of that name fails provisioning per REQ-GIT-008 rather than being reused. | REQ-GIT-140 |
| 33 | RESOLVED | Per the message-text decision: the moved-base message must convey the recorded branch and revision, the observed branch and revision, that a requirement unit was running in between, and that the operation was abandoned. Wording left to the implementation. | REQ-GIT-141 |
| 34 | RESOLVED | The tool takes exactly two parameters — `message` (string, required, used verbatim) and `files` (array of strings, optional, default empty, relative to the workspace root). These are a machine-readable contract and so are fixed. The not-a-repository error must convey that the workspace is not a Git repository and that no commit was made; wording left to the implementation. | REQ-GIT-143 |
| 35 | RESOLVED | No fixed vocabulary: the credited name is the child agent's identifier recorded verbatim as the iteration loop supplies it, so workspace-defined agents need no change. When several children contributed to one iteration the credited name is empty — the record holds one name, and inventing a join format or picking a winner would be arbitrary. The checkpoint is still recorded and the iteration number still identifies the work. | REQ-GIT-051 |
| 36 | RESOLVED | There is exactly one CLI front-end, and no requirement may be satisfied by two commands that differ. The terminal UI is not a second front-end: it renders status only and delegates every checkpoint action to that CLI. "Both CLI front-ends" and "the primary CLI front-end" were a defect of the draft and are gone; the REQ-GIT-026 refusal applies to the one CLI. | REQ-GIT-025, REQ-GIT-026, REQ-GIT-028, REQ-GIT-066 |
| 37 | RESOLVED | The first-component test is case-insensitive over the ASCII letters, so `.Rotaris/` cannot escape the exclusion on a case-insensitive filesystem. The test applies to the path as the tree names it, never to a link's target: a link is an ordinary entry at its own path, is captured and restored as a link, and is never followed — so a link aimed into `.rotaris/` cannot reach an excluded path through an included one. | REQ-GIT-003 |
| 38 | RESOLVED | Yes to the whole set. `GIT_DIR`, `GIT_WORK_TREE`, `GIT_OBJECT_DIRECTORY`, `GIT_ALTERNATE_OBJECT_DIRECTORIES`, `GIT_CONFIG`, `GIT_CONFIG_GLOBAL`, `GIT_CONFIG_SYSTEM` and the six `GIT_AUTHOR_*`/`GIT_COMMITTER_*` variables are all neutralised, with repository and working tree named explicitly on every invocation; everything else (PATH, locale) passes through. The committer identity is the same fixed `rotaris <rotaris@local>` as the author, so a checkpoint commit is recognisable from either field. | REQ-GIT-031, REQ-GIT-032 |
| 39 | RESOLVED | `<command>` renders as the Git subcommand name followed by its arguments in invocation order, single-space separated, with the executable path omitted and no quoting, eliding, or truncation. The same rendering serves the worktree layer (OQ 13). | REQ-GIT-033, REQ-GIT-013 |
| 40 | RESOLVED | The recorded tree preserves the executable bit and records a symlink as a symlink carrying its target text. A submodule is recorded as the gitlink commit id only — its working tree is never inspected, captured, or restored. The HEAD comparison is made against HEAD's tree with every excluded path removed, so "nothing to record" stays reachable in a repository that already tracks paths under `.rotaris/`. | REQ-GIT-034 |
| 41 | RESOLVED | Both residual cases resolve without raising. With no recorded checkpoint the check reports no drift and an empty dirty set, because gate 1 refuses such a restore before drift can matter. When no candidate's content can be read — every candidate ref gone, or Git failed on each — the check reports drift with the dirty set being every path the restore would touch, so the user is asked to force rather than silently overwritten. The baseline is the newest candidate whose content can actually be read. | REQ-GIT-056 |
| 42 | RESOLVED | Two texts were not intended. There are now exactly two tooltips, one disabled and one enabled; the single disabled text covers both an empty selection and a selection holding no eligible row, since the remedy is identical and a text that changes without the button changing state is a distinction the user cannot act on. | REQ-GIT-083 |
| 43 | RESOLVED | Counted once. For a non-base worktree that is also the active checkout, additions and deletions add component-wise while the files figure is the size of the union of the two path sets, so a path in both the committed and the uncommitted diff contributes once to the files figure. | REQ-GIT-107 |
| 44 | RESOLVED | Initial branch name is `main`. The append is exact: a newly created `.gitignore` gets the comment line, the `.rotaris/` line, and a trailing newline, and nothing else; an existing one gets a newline first if and only if it does not already end in one, then one empty line, then the two lines, then a trailing newline — so the append can never join itself to the user's last line. | REQ-GIT-113 |
| 45 | RESOLVED | Any run holding a session lock in this workspace counts as active — foreground, background, or headless, and whether or not this application started it. The refusal is about what may be writing to the trees being merged, and a headless run writes exactly as a foreground one does; this keeps the check consistent with REQ-GIT-127, REQ-GIT-119, and REQ-GIT-120. | REQ-GIT-124 |
| 46 | RESOLVED | The rejection conveys the path as supplied, that it resolves to the base checkout, and that a requirement unit is never run there; wording left to the implementation. Provisioning fails rather than falling back to a derived path. | REQ-GIT-140 |
| 47 | RESOLVED | The no-files form stages modifications and deletions of tracked files — a deletion is a change to a tracked file, and omitting it would produce a commit that does not match what the agent sees — and never stages an untracked file, so an agent cannot sweep a stray artefact in by omitting `files`. When `files` is named, exactly those paths are staged whatever their state, untracked files and deletions included. | REQ-GIT-143 |
| 48 | RESOLVED | Yes. Surrounding whitespace is trimmed before the comparison, so `y` with trailing spaces proceeds; the comparison is otherwise exact apart from letter case. | REQ-GIT-066 |

## Outcome

48 open questions: 47 resolved, 1 resolved with a partial omission (OQ 25 — the per-row agent commit
count is withdrawn as underivable), 0 escalated. Nothing remains outstanding for the product owner in
this domain.

## Graphical-only sweep

Product-owner decision, 2026-08-30: this product is one Electron desktop application, with no
command-line interface and no terminal user interface. The open questions above were disposed of
before that decision was taken, so this domain still carried command-line surface that every other
domain has already had removed. Applying the sweep now: every requirement whose only observable
surface was a command, a subcommand, a flag, a terminal prompt, a process exit code, or a text-mode
interface has been withdrawn. No capability was lost with the surface — each row below names the
requirement that now carries it.

| Withdrawn | What it was | Capability rescued into |
| --- | --- | --- |
| REQ-GIT-025 | "Exactly one CLI front end", and the run command's `--isolate`, `--worktree` and `--worktree-branch` flags | REQ-GIT-118 and REQ-GIT-158 (new) collect isolation, the branch name and an existing worktree to attach; REQ-GIT-021 and REQ-SESSION-184 carry those choices into the run |
| REQ-GIT-026 | Refusal of worktree options on an invocation carrying neither a task nor `--background` | REQ-GIT-118 and REQ-SESSION-184 — worktree options are offered only where a task is being started, so the refused combination is unreachable |
| REQ-GIT-027 | `--base` on the requirements run command | REQ-GIT-159 (new) — the commit a requirement run's worktrees are cut from is chosen where the unit is started from the board (REQ-TRACE-464), defaulting to HEAD per REQ-GIT-007 |
| REQ-GIT-028 | `sessions --repair`, its staleness test, its per-session report and its stale marking in the listing | REQ-GIT-160 (new) together with REQ-SESSION-182 (repair one session or all, and the stale marking); the repair performed when a session's checkpoints are opened stays REQ-GIT-094 |
| REQ-GIT-065 | `checkpoints list` and its fixed-width stdout table | REQ-GIT-086, REQ-GIT-087, REQ-GIT-088 and REQ-GIT-090 — the checkpoints card lists the same records through the same read path (REQ-GIT-050) |
| REQ-GIT-066 | `checkpoints restore`, its `--force`/`--yes` flags, its terminal prompt and its exit codes | REQ-GIT-096 (preview and unrecorded sequence), REQ-GIT-097 (preview text before anything is modified), REQ-GIT-098 (explicit consent to overwrite, in place of a force flag), REQ-GIT-099 (declining changes nothing) and REQ-GIT-100 (success, failure and safety-checkpoint reports) |
| REQ-GIT-123 | The terminal UI's status bar, and its statement that checkpoints are reached from a terminal | REQ-GIT-161 (new) for the detached-HEAD and not-a-repository states, REQ-GIT-122 for the branch item, REQ-SHELL-038 for the workspace path beside it, and REQ-GIT-075 for the Git view's own header |
| REQ-GIT-154 | The three-code command-line exit contract | REQ-GIT-157 (new) — the same distinction stated by what a refusal left behind rather than by a number, with no outcome anywhere expressed as a numeric code (REQ-SESSION-187) |

Five requirements were added, all in the next free numbers of the series: **REQ-GIT-157** (the
refusal taxonomy that replaces the exit codes), **REQ-GIT-158** (attaching an existing worktree from
the session-launch dialog), **REQ-GIT-159** (the base-revision choice for a board-launched
requirement run), **REQ-GIT-160** (stale-session repair as a desktop action) and **REQ-GIT-161** (the
status strip's detached-HEAD and not-a-repository states). No requirement identifier was renumbered,
reused or deleted, and no identifier from a retired domain is cited anywhere.

Shell-surface clauses were struck from, and the requirement kept in, REQ-GIT-001 (exit-code
equivalence under an unreachable remote), REQ-GIT-020 (the exit code of a failed lock acquisition),
REQ-GIT-021 (flag-named refusal texts and the usage exit code), REQ-GIT-031 ("from a plain shell"),
REQ-GIT-050 ("both CLI listings"), REQ-GIT-054 (the stderr-and-exit half of the unmanaged-tree
refusal), REQ-GIT-064 (the whole checkpoint-listing table, which was the withdrawn command's stdout
format; the restore preview text survives unchanged), REQ-GIT-071 (the stderr-and-exit-2 half of the
configuration-rejection report), REQ-GIT-097 ("as the CLI produces it"), REQ-GIT-124 (a headless run
counting as active — a detached background run still does), REQ-GIT-146 (the withdrawn table's
column widths) and REQ-GIT-148 (`[detached]` in the terminal UI). The Overview lost "CLI flags and
subcommands" from its list of surfaces; the Data & Formats section lost the textual listing format
and no longer describes the preview text as shared with a command. Two section headings were
renamed to *Retired Command-Line Surfaces (Runs and Sessions)* and *Retired Checkpoint Command
Surface*, since the withdrawn requirements stay in place under them.

Nothing about running external programs was touched, because none of it is a way for a user to drive
this product from a shell: the `git_commit` agent tool (REQ-GIT-143) is unchanged; the configured
`integration.validation_command` the integration agent runs inside its worktree (REQ-GIT-156) is
unchanged; every Git invocation this domain makes, together with its timeouts and its error
semantics (REQ-GIT-013, REQ-GIT-033, REQ-GIT-141), is unchanged; the lifecycle hooks and per-iteration
checkpoints of a hidden integration run (REQ-GIT-131) are unchanged; and the `git config --global`
lines this domain quotes to the user in REQ-GIT-012 and REQ-GIT-114 are instructions for Git itself,
displayed in the desktop, not a surface of this product.

### Dispositions this sweep supersedes

Nine rows of the dispositions table were decided against a surface that no longer exists and are read
as follows. **OQ 8**, **OQ 14** and **OQ 23** stated a three-code exit contract; the codes went with
REQ-GIT-154, and the distinction they drew — refused before any work, against accepted and then
refused or failed — is carried without numbers by REQ-GIT-157, so each row's substance stands and
only its codes do not. **OQ 22** is superseded outright: there is no `--workspace/-w` to default,
the workspace is the one the window has open (REQ-STARTUP-041, REQ-SHELL-021), and the rule that
survives the flag is that a workspace names the base checkout whose `.rotaris/sessions/` holds the
session and never a session's worktree. **OQ 36** is superseded outright: with no command surface
there is no front end to be the only one of, and REQ-GIT-050's single read path already gives every
checkpoint surface one answer. **OQ 48** is superseded with REQ-GIT-066: consent to overwrite is an
explicit control (REQ-GIT-098), so there is no typed reply to trim or case-fold. **OQ 15** stands on
its merits — the report content and the stale marking are REQ-GIT-160's and REQ-SESSION-182's — and
only the `sessions --repair` venue is gone. **OQ 11** likewise stands: what the status strip must
convey is REQ-GIT-161's, REQ-GIT-122's and REQ-SHELL-038's. **OQ 5** is untouched, since the liveness
probe and the lock file's `host` field (REQ-GIT-093, REQ-GIT-020) never depended on the surface that
invoked them.


> ## Amendment, 2026-09-02 — the withdrawn `worktree_subpath` key, and spike 19's report on ESC-21
>
> **ESC-28 / ESC-29 follow-through.** `REQ-GIT-074` said a `worktree_subpath` written under
> requirement-execution worktree configuration "is rejected as an unknown key, on the terms
> `REQ-CONFIG-194` fixes". Those terms now say the key is **reported and ignored**, the workspace
> opening and every other key loading as though it were absent. The sentence cited the requirement whose
> terms it contradicted, so a build reading `REQ-GIT-074` and a build reading `REQ-CONFIG-194` would have
> behaved differently over the same file. `REQ-GIT-074` now states the outcome the ruling fixes and cites
> `REQ-CONFIG-194` and `REQ-CONFIG-183` for the terms, with the superseded wording recorded in place
> rather than deleted. The configuration-surface line in Data & Formats carried the same sentence and is
> corrected with it.
>
> **Nothing about the key itself changed.** `worktree_subpath` is still not a configuration key of any
> domain, still configures nothing, and `REQ-GIT-137` still fixes where requirement-unit checkouts are
> placed. What changed is only what happens to a file that still states it.
>
> **The unknown-key rule was checked and is not weakened by this.** The carve-out reaches exactly a key
> this specification defined and withdrew and a key it names as not a configuration key of this domain.
> A key nobody defined — a mistyping, or one something other than this product wrote — is still a hard
> load failure under `REQ-CONFIG-183` and still fatal under `REQ-CONFIG-233`. Getting that backwards
> would have been worse than the defect it fixes, because the `requirements:` block drives runs nobody
> is watching.
>
> **ESC-21, status corrected rather than settled.** `REQ-GIT-128`'s closing paragraph said the strength
> of the refusal "is left to the synchronised-storage spike". That spike has now reported. It measured
> ESC-21's **first** premise and confirmed it — exclusive create is a genuine primitive over a network
> share, 2,500 races, exactly one winner in 2,500, more than one in none — and it could **not** measure
> the second premise, which needs a second machine and a synchronisation account, so it stated the
> closing experiment precisely and declined to invent a result. It also established two things the
> requirement rests on: the detection `REQ-STARTUP-166` performs is real, precise for providers that
> register with the platform, and costs single-digit milliseconds; and **nothing in the lock can break
> the tie afterwards**, because the orderable timestamp step is about a millisecond while the measuring
> machine's own clock carried an offset of about 855 milliseconds against a public source. The
> requirement now records that the spike has reported without deciding the strength, so a reader does
> not wait for an answer that has already come back empty. **The direction is unchanged and was never
> the spike's to reopen: the product does not proceed under a lock that does not lock.**
