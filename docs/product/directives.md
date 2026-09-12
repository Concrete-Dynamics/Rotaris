# Product directives

Behaviour decided by the product owner. **These govern over every requirement they name** — see
[`README.md`](README.md) for the precedence rule, the classification that routes a request here
rather than to an open question or an escalation, and the obligations a directive puts on the commit
that writes it.

- Identifiers: `PD-<DOMAIN>-<NNN>`, `<DOMAIN>` taken from the specification domain that owns the
  behaviour. Stable, permanent, contiguous from 1 per domain, never renumbered and never reused.
- Every directive states a **disposition** against live requirements, and every requirement it
  supersedes, narrows or extends carries a back-pointer at its own definition in `docs/spec/`.
- Parsed by `tools/symbol-artifact/generate.mjs`. A disposition naming an identifier the
  specification does not define fails `pnpm check`.

## Count

**Two.** The count here is the number of entries below, written nowhere else so that it cannot go
stale.

---

<a id="pd-shell-001"></a>

### PD-SHELL-001 — a chosen project folder may be opened in an additional main window

Choosing a project folder from inside a window SHALL offer two outcomes, and which one is taken SHALL
be decided by the gesture that starts the flow rather than by a question asked afterwards: the
**replacement** of REQ-SHELL-017, or the **addition** of a main window on the chosen folder with the
window that issued the request left open and unchanged.

The add route SHALL be reachable by exactly two gestures, and by no other: a shortcut-less command
palette entry labelled "Open project folder in a new window", present in every window and in the
composer's slash catalogue on the terms of REQ-SHELL-048 and REQ-SHELL-056; and activating the
title-bar workspace chip of REQ-SHELL-035 with the platform's secondary-activation modifier held.
Every other activation of that chip is the replacement route, on which REQ-SHELL-021 governs in full.

On the add route the product SHALL build a main window on the chosen folder, show it, surface it on
the terms REQ-SHELL-161 fixes for every window this product owns, and leave every window already open
exactly as it was — the same workspace, the same active view, the same composer contents, the same
runs still executing. The replacement semantics of REQ-SHELL-017 SHALL NOT apply, no window SHALL be
closed, and the three gates of REQ-SHELL-021 SHALL NOT be evaluated: an active run, an unsaved
settings edit or a running worktree integration, in the requesting window or in any other, neither
blocks the request nor is disturbed by it. The chosen folder SHALL be resolved and persisted as the
last-opened workspace on the terms REQ-WORKSPACE-005 already fixes for a folder chosen through the
chooser of REQ-WORKSPACE-009. A failure to build the added window SHALL leave every open window
usable and SHALL report it on the terms REQ-SHELL-019 fixes for a failed replacement. Whether the
chosen folder is one a window already has open is decided by the rule REQ-STARTUP-163 fixes, which
this directive cites rather than restating; where it is, PD-WORKSPACE-001 governs and no window is
built.

**Why, and what it costs.** Two projects open side by side is what the owner asked for, and the
specification has no route to it from inside the application: REQ-STARTUP-163 builds an additional
window only for a directory a *launch* carries, and says in its own text that a request originating
in a window is not that case. The alternative — two operating-system processes — is refused by
REQ-STARTUP-161 and was declined as [R-003](requests.md#r-003). The cost is threefold and none of it
is hypothetical: per-window state that a single-window product could keep in one place must now be
correct per window (the approval queue, the followed session, the persona and terminal windows, the
deferred first-launch prompt); REQ-SHELL-021's gates no longer stand between a user and a second
workspace, so the gesture must be as cheap to undo as to make, which is why closing the added window
changes nothing else; and the choice cannot be offered by the native chooser, which carries no
buttons of ours (REQ-SHELL-164), which is why the gesture is chosen before the chooser opens.

> **Extends:** REQ-SHELL-017, REQ-STARTUP-161
> **Narrows:** REQ-SHELL-021

*Raised by the owner, 2026-09-12; logged as [R-004](requests.md#r-004).*

<a id="pd-workspace-001"></a>

### PD-WORKSPACE-001 — choosing the folder that is already open offers a new session

Where the folder chosen through the project-folder chooser of REQ-WORKSPACE-009 is one the requesting
window already has open, the choice SHALL NOT be left without observable effect. The product SHALL
raise a transient notice in the requesting window and in no other, stating that the folder is already
open and carrying exactly one action, labelled "Start a new session", which opens that window's own
start-session surface for the workspace it already has open.

The offer SHALL NOT be a modal dialog and SHALL NOT take keyboard focus from what the user was doing.
No main window SHALL be built and none SHALL be closed; the window's workspace, its active view, its
composer contents, its running runs and the last-opened-workspace preference SHALL all be left as
they were, whether the action is taken, the notice is dismissed, or it is ignored until it withdraws.
Whether the chosen folder is the one already open is decided by the rule REQ-STARTUP-163 fixes, which
this directive cites rather than restating.

**Why, and what it costs.** REQ-WORKSPACE-010's silent no-op is the right answer to a user who picked
the wrong folder by accident. It is the wrong answer to the user who deliberately re-picks the folder
they are already working in, because that gesture carries a legible intent — a second place to work
in this project — and the product's answer to that intent is a second session, which it already
builds. A no-op discards the intent and, to the person who made it, is indistinguishable from the
chooser having failed. The cost is that a chooser can now end in something on screen, so a reader of
REQ-SHELL-021's "a decline shows no folder chooser and changes no window" must not mistake this
notice for a change to a window; and a notice was chosen over a dialog deliberately, because someone
who re-picked their own folder should not be interrupted more heavily than the no-op this replaces.

> **Supersedes:** REQ-WORKSPACE-010
> **Extends:** REQ-NOTIFY-003, REQ-NOTIFY-013
> **Extends:** REQ-SHELL-021

*Raised by the owner, 2026-09-12; logged as [R-005](requests.md#r-005).*

---

<!--
The template. Copy it, do not read it as a directive — it names no real identifier and the
generator skips it because it sits inside a comment.

### PD-CHAT-001 — the composer states the model it will start the next run with

The composer MUST display the model the **next** run will start with, as text, beside the model
selector, in every run state including while a run is active. Where the next run would start with a
model other than the one the active run is using, the composer MUST state both.

**Why, and what it costs.** A user who changes model mid-run cannot otherwise tell whether the
change took effect now or at the next run, and the two readings differ in money. The cost is a
second piece of text in a composer the design draws tight, and a state the transcript header already
carries once.

> **Supersedes:** REQ-CHAT-009
> **Narrows:** REQ-CHAT-006
> **Extends:** REQ-CHAT-078

*Raised by the owner, 2026-09-12; logged as [R-001](requests.md#r-001).*
-->
