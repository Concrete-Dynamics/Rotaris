# Resolution Record — Domain 05, Agent Tooling, Terminal Execution, Permissions, and Approvals — Amendments outside the numbered questions

Part 3 of 3 of [domain 05's resolutions](../05-tools-permissions-approvals.md), which indexes every part.

## Amendments outside the numbered questions

Four changes were made that no open question asked for, and are recorded here for completeness.

- **REQ-TOOLS-063** loses its default action. The draft made *Approve once* both the primary-styled and the default (Enter-activated) button; the resolution of question 6 removes the default action entirely and puts initial focus on Deny. Recorded separately because it reverses a statement the draft made positively rather than filling a gap.
- **REQ-TOOLS-039** gains three patterns — `rmdir /S *`, `rd /S *`, `del /F *` — as the direct consequence of question 15's decision that only the command-name token folds case.
- **REQ-TOOLS-114** now cites `REQ-SANDBOX-048` for the sandbox mode vocabulary instead of restating it, so the two domains cannot drift.
- **REQ-TOOLS-165** and **REQ-TOOLS-184** now state explicitly that the inventory load state and the status-strip flags are conveyed in text and never by colour alone, per `REQ-SHELL-149`.

**Superseded: which domain owns the two sandbox runtime keys.** This record treats REQ-TOOLS-116 as
the requirement that fixes `runtime.sandbox_writable_roots` and its absolute-path refusal (open
question 22), and question 18 treats REQ-TOOLS-117 as where "real egress control lives". Domain 10's
resolution record, written independently, reached the same conclusion from the other side and had
REQ-SANDBOX-050 *cite* REQ-TOOLS-116 for the message shape. The fourth reconciliation round then
decided the ownership the opposite way: REQ-SANDBOX-050 is the product's single definition of
`runtime.sandbox_writable_roots`, its default and its entry rules, and REQ-SANDBOX-051 of
`runtime.sandbox_allow_network` and its default, both cited by REQ-CONFIG-127. Both decisions stayed
live in the corpus until the sixth round, which is the only reason it took this long to notice: the
two records agree with each other and disagree with the ownership table, and no single reading sees
all three at once. The direction that stands is the fourth round's — the domain that defines
confinement defines the keys that configure it. Nothing about the rule itself changed under either
reading, and no behavior was ever at risk; what was wrong was which requirement a reader is meant to
go to. REQ-TOOLS-116 and REQ-TOOLS-117 still carry copies of what those two own and cite neither, so
the follower side of the pair is not yet written.

> ## Amendment, 2026-09-11 — OQ-5, OQ-38 and OQ-55: the closing frame, the sampling period, and a ceiling
>
> **No disposition below is reversed.** Three questions raised by building the live terminal were ruled by the
> product owner, and this domain follows two keys it does not own.
>
> **REQ-TOOLS-127 — what the closing frame carries (OQ-5).** The requirement stated that a completed stream's
> closing `screen` frame carries text equal to the observation's final output text, which is plain, capped and
> truncated from the oldest end, while REQ-SHELL-095 and REQ-SHELL-098 require a character grid with cursor
> addressing, alternate-screen fidelity, per-cell attributes and sixteen colours. Read as one instant those cannot
> both hold. **They are not one instant.** The grid requirements govern the stream while the process is running;
> the closing frame is emitted after it has exited, when there is no cursor to paint, no alternate screen to be in
> and no further output to attribute to a cell. The requirement now says so, and says that the closing frame is a
> literal replacement carrying an explicit marker that it is one and is the only frame of a stream of which that is
> true. **A second gap is closed with it, and it was found by the code rather than by a reading:** the closing
> sentence bound a *foreground* stream only, while the built product emits a closing frame for `bg:` streams too and
> a proof asserts it. The requirement now covers both. No behaviour changed.
>
> **REQ-TOOLS-126 — the sampling period is a ceiling, and it now cites the aggregate (OQ-38).** The period is a
> ceiling on batching rather than a fixed cadence, and what may arm an earlier frame is REQ-CONFIG-117's, which this
> domain cites rather than restates. The strict fixed-period reading was not available: it puts REQ-SHELL-166 — a
> SHALL carrying a demonstration obligation against a real pseudo-terminal — out of reach at REQ-TOOLS-126's own
> default and at every larger value its range permits. **This also discharges what ESC-22 recorded as not
> discharged**, in the amendment to domain 02 of 2026-09-02: *"whether REQ-TOOLS-126, REQ-TOOLS-108 and
> REQ-TOOLS-127 should cite REQ-MONITOR-306 from their side is domain 05's; an implementer reading REQ-TOOLS-126
> alone would build per-stream sampling with no aggregate."* REQ-TOOLS-126 now cites it, and says why it is cited.
>
> **REQ-TOOLS-108 — the background-session count has a maximum (OQ-55).** The key's range is REQ-CONFIG-116's and
> is now 1–64; this requirement follows it and keeps what it owns, the effective limit and the `execution_error`
> message on reaching it. The two inventory tables follow both changes.
>
> **What is deliberately not changed.** REQ-TOOLS-127's guarantee that streaming changes nothing the agent sees is
> untouched, and none of the three amendments reaches it: the closing frame's shape, the period's reading and the
> session ceiling are all about what a *display* is delivered, never about what a command does or what an
> observation reports.

> ## Amendment, 2026-09-18 — OQ-61: a read-only git member joins the registry
>
> OQ-61 asked which of three shapes an isolated run's repository-metadata reads should take, and the
> owner ruled for the second: REQ-TOOLS-001 gains a read-only git member rather than a new read root
> or a new opening-context message.
>
> **REQ-TOOLS-193 (new) — `git_read`.** Operations exactly `head` and `read_ref`, resolved by reading
> `HEAD`, loose refs and `packed-refs` through the worktree's `gitdir:` pointer and its `commondir`,
> with no subprocess and no command run. The tool declares reading — repository files above the
> workspace fence — and neither writing nor running, and joins the read-only class of REQ-TOOLS-007;
> its confinement is its own whitelist (any other repository path refused; configuration, hooks,
> objects, the index and logs never readable), not the path fence, which keeps refusing every direct
> read of the same metadata. **REQ-TOOLS-001, REQ-TOOLS-006 and REQ-TOOLS-007** carry the membership:
> the closed set is nineteen names, the reads list gains the name, the class gains the member, and
> the `coordinator_only` removal list is untouched because a read-only tool survives it by
> construction. No policy rule is added: the tool takes no path argument, so the outside-workspace
> ask never fires, and the read-only allow rules admit it in bulk like every other member of the
> class. The first execution is the unit suite against real repositories, reported in OQ-61's entry
> in place.
