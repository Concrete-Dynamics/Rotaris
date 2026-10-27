# Open-Question Resolutions — Git Integration, Worktrees, and Checkpoints — Graphical-only sweep

Part 3 of 3 of [domain 06's resolutions](../06-git-worktrees-checkpoints.md), which indexes every part.

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
