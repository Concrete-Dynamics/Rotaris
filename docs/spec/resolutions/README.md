# The resolutions — what is in `resolutions/`

The record of what became of the open questions **each specification domain's first draft raised**. One file per
domain: the dispositions, the cross-domain consequences, and the amendments a later ruling wrote back into the
requirements. Where the specification states what must happen, these files state how a question about it was
answered, and by which ruling.

**23 files on 2026-11-05**: one per domain — the 20 the specification ships (domains 01 to 16 and 19 to 22) and the two it
retired (17 and 18) — one requirements-adoption record, and one dated cross-domain record that belongs to no domain.

## What each file is

- **`NN-<domain>.md` is named for its domain and its front matter says which one** (`reference: ROTARIS-CRW-001`,
  `domain:`, `date:`, `status:`). **19 of the 23 are an index**: since 2026-10-26 a file over the document budget is a
  frontmatter block, a title and a table of its parts, and the rest moved verbatim into `NN-<domain>/`
  ([the document budget](../../README.md#the-document-budget)). Every anchor kept its text, so a link to one now names
  its part. The four without parts are `10-sandbox-network-egress.md`, `17-terminal-ui.md`, `22-requirements-adoption.md`
  and the dated record below.
- **An amendment is a blockquote at the top of the file**, dated, naming the rulings or open questions it applies
  (`ESC-42`, `OQ-364`, "superseded by the storage rulings"). It is the file's current reading; the dispositions below
  it are the text as the round wrote it, which is what makes the record evidence.
- **A disposition is one requirement's answer**, kept whole — a question is never reworded, renumbered or dropped.
  Where a later round reversed one, the reversal is in the blockquote and the original stays.
- **Domains 17 and 18 are retired** (`docs/spec/README.md`): their resolutions stay as history, for the 444 withdrawn
  `REQ-TUI` and `REQ-CLI` identifiers. Domain 22 is **decided, not derived** — its record is an amendment round, not a
  set of derived questions (`R-088`).
- **A domain whose file is a single doc** — `10`, `17`, `22` — is a runtime-state consequence, not a rule: a file that
  later passes the budget splits into an index and a parts folder like any other.

## The files

| File | Domain | Parts | What it holds |
|---|---|---|---|
| [01-run-orchestration.md](01-run-orchestration.md) | `run-orchestration` (01) | 4 | dispositions, the graphical-only sweep, cross-domain consequences, A4's root execution record |
| [02-run-monitoring-steering.md](02-run-monitoring-steering.md) | `run-monitoring-steering` (02) | 3 | superseded in part by the storage rulings of 2026-09-01 |
| [03-conversation-composer-transcript.md](03-conversation-composer-transcript.md) | `conversation-composer-transcript` (03) | 3 | amendments to 2026-09-27 (ESC-37, ESC-39) among them |
| [04-model-providers-auth.md](04-model-providers-auth.md) | `model-providers-auth` (04) | 3 | the money rule's floor (ESC-42, 2026-09-29) among them |
| [05-tools-permissions-approvals.md](05-tools-permissions-approvals.md) | `tools-permissions-approvals` (05) | 3 | the soft-paused stream's end (OQ-370, 2026-10-21) among them |
| [06-git-worktrees-checkpoints.md](06-git-worktrees-checkpoints.md) | `git-worktrees-checkpoints` (06) | 3 | the storage-subpath question (OQ-263, 2026-10-13) among them |
| [07-sessions-persistence.md](07-sessions-persistence.md) | `sessions-persistence` (07) | 4 | superseded in part by the storage rulings of 2026-09-01 |
| [08-requirements-traceability.md](08-requirements-traceability.md) | `requirements-traceability` (08) | 4 | the board-parse round (2026-09-11) among them |
| [09-lifecycle-hooks.md](09-lifecycle-hooks.md) | `lifecycle-hooks` (09) | 2 | which workspace an approval covers (2026-09-02) among them |
| [10-sandbox-network-egress.md](10-sandbox-network-egress.md) | `sandbox-network-egress` (10) | — | superseded in part by ESC-6, applied 2026-09-01 |
| [11-startup-distribution-updates.md](11-startup-distribution-updates.md) | `startup-distribution-updates` (11) | 5 | `REQ-STARTUP-169`–`181` minted at R-084 (2026-10-22) among them |
| [12-desktop-shell-windows.md](12-desktop-shell-windows.md) | `desktop-shell-windows` (12) | 3 | a non-zero cost rendering as a floor (ESC-42, 2026-09-29) among them |
| [13-workspace-context-onboarding.md](13-workspace-context-onboarding.md) | `workspace-context-onboarding` (13) | 4 | the dispositions of the domain draft's questions |
| [14-library-artifacts-improvements.md](14-library-artifacts-improvements.md) | `library-artifacts-improvements` (14) | 2 | the child report's artifact fallback (OQ-113, 2026-09-29) among them |
| [15-settings-configuration.md](15-settings-configuration.md) | `settings-configuration` (15) | 4 | the dispositions of the domain draft's questions |
| [16-mcp-integration.md](16-mcp-integration.md) | `mcp-integration` (16) | 2 | superseded in part by the storage rulings of 2026-09-01 |
| [17-terminal-ui.md](17-terminal-ui.md) | `terminal-ui` (17, **retired**) | — | the withdrawn `REQ-TUI` domain's questions; history only |
| [18-cli-headless.md](18-cli-headless.md) | `cli-headless` (18, **retired**) | 4 | the withdrawn `REQ-CLI` domain's questions; history only |
| [19-notifications-errors-recovery.md](19-notifications-errors-recovery.md) | `notifications-errors-recovery` (19) | 3 | disposition 27's signature (OQ-364, 2026-10-20) among them |
| [20-event-history-replay-export.md](20-event-history-replay-export.md) | `event-history-replay-export` (20) | 8 | superseded in part by the storage rulings of 2026-09-01 |
| [21-ui-performance-benchmark.md](21-ui-performance-benchmark.md) | `ui-performance-benchmark` (21) | 3 | superseded in part by the storage rulings of 2026-09-01 |
| [22-requirements-adoption.md](22-requirements-adoption.md) | `requirements-adoption` (22) | — | the adoption assistant (R-088, 2026-10-29): thirty identifiers **decided, not derived** |
| [2026-09-06-accepted-review.md](2026-09-06-accepted-review.md) | no domain | — | the accepted review amendments of 2026-09-06, spanning OQ-1 to OQ-37 |

## How these are read, and where the domain file is

A resolution is cited by the requirement it disposes of, and every live domain's **requirements** are one hop away in
[`../NN-<domain>.md`](../README.md) and its parts; the domain table with the prefixes and the counts is
[`../README.md`](../README.md). Several domain files carry a `## Parts` table of their own; the parts of a domain's
*specification* and the parts of its *resolutions* sit in different folders and share only the number.

**An amendment that writes back into a requirement is applied in the specification, in place, and quotes what the
sentence previously read** (`docs/spec/README.md`, "How a requirement changes"); a resolution never overrides a
requirement by itself. Where a ruling departed from a requirement it is a **directive**
([`../../product/README.md`](../../product/README.md)) with a back-pointer under the requirement.

## Where a new resolution goes

The file of its domain — an amendment as a dated blockquote at the top, a disposition as an entry where the file holds
its questions — and, for a new domain, `NN-<domain>.md` beside the others. A file over the document budget splits into
an index and `NN-<domain>/` like any other document.
