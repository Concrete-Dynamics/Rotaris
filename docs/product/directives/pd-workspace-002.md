[Product directives](../directives.md) › PD-WORKSPACE-002

<a id="pd-workspace-002"></a>

### PD-WORKSPACE-002 — instruction files are picked up beyond the workspace and switched per file

**Discovery.** The workspace root holds four instruction-file names, in this order: `AGENTS.md`,
`AGENTS.override.md`, `CLAUDE.md`, `CLAUDE.override.md`. `AGENTS.override.md` suppresses `AGENTS.md`
alone, and `CLAUDE.override.md` suppresses `CLAUDE.md` alone; the two pairs are independent, so a
workspace holding an override and the other pair's base contributes the override and that base.

Beyond the workspace, instruction files are read from five further bases, in this order, mirroring
the skill user-scope roots of REQ-WORKSPACE-051: the Rotaris global configuration directory (the
per-user scope of REQ-CONFIG-001, beside `agents.yaml`); `~/.agents`; `~/.config/opencode`;
`~/.openhands`; and `/etc/codex`, which is consulted on platforms with an `/etc` hierarchy only,
on the same rule REQ-WORKSPACE-051 fixes for skills. Each of those bases holds at most two names:
`AGENTS.md`, then `CLAUDE.md`. No ancestor, repository root or intermediate directory is consulted
for instruction files — the project scope stays the workspace root the owner chose — and no other
file name is read.

**Order.** The merged output follows discovery order: the workspace pair or pairs first, then the
global directory, then the three home-relative bases in the order named above, then the
machine-wide base. Within one base `AGENTS.md` precedes `CLAUDE.md`. Each contributing file's
block keeps the one-line `<!-- source: {absolute path} -->` comment and the blank-line separation
REQ-WORKSPACE-043 fixes; a file switched off contributes nothing, not even its source comment.

**The inventory.** The Instructions category lists every present file, each row carrying a stable
identity, its file name, its source, its absolute path, and whether it is switched on. The source
reads `workspace` for the workspace root, `global` for the global directory, `user (~/.agents)`,
`user (~/.config/opencode)`, `user (~/.openhands)` for the three home-relative bases, and
`machine (/etc/codex)` for the machine-wide base.

**The switches.** Each row carries a per-file on/off switch. The policy is the section-class
`instructions:` key, holding an `overrides` map from the row's stable identity to `on` or `off`;
absent means `on`. The map overlays per file, so a workspace file naming one file leaves every
other file's inherited policy standing. The master switch `inject_agents_md` stands above all of
them: while false no context file is read at all, whatever the per-file policies say. The screen
holds the switches pending like every other destination-1 value — Save writes them into the
workspace file sparsely (an `on` that returns a file to its baseline removes that file's key,
unless a lower layer states a policy for it, in which case the baseline is written explicitly),
Discard restores them, and the save bar governs them. The empty states name the files to create.

**Injection.** The workspace-context injection of REQ-WORKSPACE-047 consumes the enabled set — the
present files whose per-file policy is `on` — in discovery order, under the master switch, and is
built in the same round as the switches. It had to be: that mechanism was an empty slot in the
context-unit list when this directive was drafted, so switches shipped without it would have been
switches over nothing. Within the enabled set an override suppresses its own base, which is where
REQ-WORKSPACE-042 meets a third state it has no word for — a file that exists and is switched off —
resolved over the enabled set rather than over presence and logged as **OQ-64**. The owner ruled OQ-64
on 2026-09-27 ([R-052](../requests.md#r-052)) for that reading: an override suppresses its base only while the
override is itself switched on, so switching an override off returns its base to the merge, and the
inventory shows no *suppressed* row state.

**Why, and what it costs.** The owner keeps standing instructions in more than one place — a
global `AGENTS.md`, a project's `CLAUDE.md` in the Claude Code convention — and wants individual
files silenced without deleting them. The specification faithfully forbids both halves: the
workspace-root-only closed rule names `CLAUDE.md` and every global location as never read, and the
settings screen offers no per-file switch on purpose. The costs are three. A second precedence
dimension: scope order decides sequence, the per-file switch decides membership, and the master
switch decides everything — three facts a reader must hold where one sufficed. A wider reach: a
file under the home directory or the machine-wide directory now reaches an agent's context, which
is the same trust consideration the machine-wide skill root already carries and states with its
rule. And a workspace file now governs files that do not live in it: the policy for a global file
is recorded in the workspace that silences it, so a user reading the global file sees a file that
no longer governs everywhere.

**Where REQ-CONFIG-464 sits.** That requirement's "no per-file switch over individual instruction
files" clause states its own ground in the same breath — "the Instructions category remaining a
read-only inventory (REQ-CONFIG-276, REQ-CONFIG-277)" — so the two inventory requirements are what
this directive narrows, and the clause stops governing with them. *Since 2026-10-13
([OQ-237](../../architecture/open-questions.md), GV1, [R-072](../requests.md#r-072)) REQ-CONFIG-464 is named under Narrows
below, beside `PD-CONFIG-001`'s disjoint case, the MCP-grant half. The reason it was first left out no longer holds:*
"REQ-CONFIG-464 is deliberately **not** named in the dispositions below: `PD-CONFIG-001` already narrows it for the MCP-grant
half, one requirement carries one narrowing directive so that precedence is unambiguous, and the two halves are unrelated
subjects that no single revision could honestly hold. Its back-pointer says as much."

> **Narrows:** REQ-WORKSPACE-041, REQ-WORKSPACE-042, REQ-CONFIG-276, REQ-CONFIG-277, REQ-TOOLS-165, REQ-CONFIG-464, REQ-CONFIG-256, REQ-CONFIG-417
> **Extends:** REQ-CONFIG-040, REQ-CONFIG-047, REQ-WORKSPACE-043, REQ-WORKSPACE-048, REQ-CONFIG-258, REQ-WORKSPACE-039

*Corrected 2026-10-13 under OQ-237: REQ-CONFIG-256 and REQ-CONFIG-417 move from Extends to Narrows. The `instructions:` key
joins REQ-CONFIG-256's written keys, which are "exactly" a list, and the per-file switches join REQ-CONFIG-417's destination
1, an enumerated set; a change to an exact enumeration is a narrowing (acceptance finding F15). Their cases are disjoint
from `PD-CONFIG-003`'s, the two runtime timeouts.*

*Raised by the owner, 2026-09-21; logged as [R-046](../requests.md#r-046).*
