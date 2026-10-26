[Product directives](../directives.md) › PD-TOOLS-002

<a id="pd-tools-002"></a>

### PD-TOOLS-002 — the requested permission mode always applies; no unattended downgrade

**The rule.** The permission mode a run requested SHALL be the mode it runs under — for every
agent in the run, for the whole of the run, with no exception for unattended, unsandboxed, or
unattended-and-unsandboxed runs. Concretely:

- The **requested** mode is selected exactly as today — a persona-level `permission_mode` pin,
  then a session-level override, then `runtime.permission_mode` — and the **effective** mode
  SHALL equal it. Attendedness, confinement status, and `runtime.allow_unsandboxed_autonomous`
  SHALL NOT alter it. The downgraded flag is always false and the downgrade reason is always
  empty.
- This reaches **every agent**: the entry agent, delegated children at any depth, agents built
  later in the same run, and agents already working when the mode is changed mid-session. A
  session-level override records the requested name; agents built later apply it directly, with
  no re-resolution against attendedness, confinement, or the opt-in. A mid-session change is
  applied directly to every live policy context and to the recorded override, likewise with no
  re-resolution.
- There are **no downgrade artifacts**: no `permission_mode_downgraded` timeline event, no
  transcript downgrade message, no downgrade log warning, and no downgrade reason string. The
  run-start announcement (REQ-TOOLS-071, REQ-SANDBOX-104, REQ-SANDBOX-110) records the
  requested (= effective) mode together with the sandboxed flag and the backend name from one
  reading of status.
- The unattended advisory SHALL be empty for an `autonomous` run — it proceeds, and nothing is
  shown. For `ask` and `restricted` the advisory behaves as today except that it SHALL never
  claim a downgrade was applied. The advisory requirements (REQ-TOOLS-072, REQ-TOOLS-192,
  REQ-SANDBOX-107) still govern that behaviour; this directive only removes the downgrade
  sentence from it.
- `runtime.allow_unsandboxed_autonomous` is retained as an inert key — same name, same default
  `false`, same layering — and SHALL have no effect on any run. A board run granted both the
  preset and the opt-in still satisfies its elevation; a run granted the preset alone now
  satisfies it too.

What is **unchanged**: a run that requests confinement the host cannot deliver still does not
start; a confinement failure at command time still refuses with `sandbox_unavailable` rather
than running unconfined; genuine `ask` decisions — from the `ask`/`restricted` presets and
from the ask rules — are still settled by the headless approval policy where no prompt can be
shown; the persona-pin direction (tightening reaches a pinned agent, loosening does not) still
holds; the audit and timeline shapes (REQ-TOOLS-082, REQ-MONITOR-153) are unchanged, carrying
`downgraded: false`, an empty
reason, and `skipped_personas` as today; the no-confinement disclosure of REQ-SANDBOX-130 is
still shown wherever it is shown today; the mode flag (REQ-WORKSPACE-022) shows the requested
(= effective) mode; and the retired TUI/CLI texts are not product behaviour
and are untouched by this directive.

**Why, and what it costs.** The owner selects `autonomous` and means it: an unattended run
without a sandbox SHALL run autonomous rather than be tightened to `ask`. The specification is
faithful — the downgrade is exactly what REQ-TOOLS-067 fixes — and the product is changing
anyway. What is given up is the fail-safe: an autonomous run now executes with the autonomous
default (allow) under no confinement, held only by the destructive deny rules, the path fence,
and the egress policy. Unanswered `ask` decisions still refuse via the headless policy, so a
run under `ask` that nobody watches still parks rather than proceeds; only `autonomous` stops
asking. This directive also settles the recorded defect of a mid-session switch to autonomous
not reaching agents built later: with no re-resolution step left, there is nothing stale left
to resolve through.

> **Supersedes:** REQ-TOOLS-067, REQ-TOOLS-068, REQ-TOOLS-070
> **Narrows:** REQ-TOOLS-048, REQ-TOOLS-069, REQ-TOOLS-071, REQ-TOOLS-072, REQ-TOOLS-073, REQ-TOOLS-125, REQ-SANDBOX-052, REQ-SANDBOX-098, REQ-SANDBOX-099, REQ-SANDBOX-101, REQ-SANDBOX-103, REQ-SANDBOX-104, REQ-SANDBOX-105, REQ-SANDBOX-106, REQ-SANDBOX-107, REQ-SANDBOX-110, REQ-CONFIG-124, REQ-CONFIG-411, REQ-TRACE-470

*REQ-TOOLS-071, REQ-TOOLS-072 and REQ-SANDBOX-104 entered this line on 2026-10-07. The rule above has named all three by
identifier since 2026-09-21 and removes the same downgrade clause from each, while this line omitted them: the note at
REQ-SANDBOX-104 was written in this directive's own commit (`ed1c167`) and read "Narrowed by" with nothing here behind it,
and the notes at REQ-TOOLS-071 and REQ-TOOLS-072, with the missing one at REQ-TOOLS-069, are written now. No rule text
changed ([OQ-222](../../architecture/open-questions.md), ruled under [R-072](../requests.md#r-072);
[`six-back-pointers-name-a-directive-whose-disposition-does-not-name-their-requirement`](../../defects/fixed/six-back-pointers-name-a-directive-whose-disposition-does-not-name-their-requirement.md)).*
