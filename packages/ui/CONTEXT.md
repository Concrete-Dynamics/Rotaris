# Shell

The one main window and everything drawn in it: the seven views, the conversation surface, and how
the product tells a user what happened. This context renders other contexts' vocabularies and owns
almost none of them — where a status reaches the screen, the **normalisation** is this context's and
the underlying value is its own domain's.

Terms are derived from `docs/spec/12-desktop-shell-windows.md`,
`docs/spec/03-conversation-composer-transcript.md` and
`docs/spec/19-notifications-errors-recovery.md`.

> Which views exist, what they are called, their order and their tabs come from `docs/spec/`.
> `docs/design/` is adopted for the design language and **not** for information architecture
> (`docs/design/README.md` §2). No term here may be used to introduce a surface the specification
> does not state.

## Language

### The window

**Primary view**:
One of exactly seven, in this fixed order: Overview, Workspace, Mission, Requirements, Git, Library,
Settings. Exactly one is visible at a time. — `REQ-SHELL-023`
_Avoid_: page, screen, tab (a **tab** is inside a view), route

**Navigation rail**:
The left-hand strip the primary views are selected from. — `REQ-SHELL` navigation rail

**Title bar**:
The frame above the views, carrying brand, workspace and session status. — `REQ-SHELL` title bar

**Status strip**:
The frame below the views, carrying workspace, branch, safety, cost and cloud indicators. —
`REQ-SHELL` status strip
_Avoid_: status bar, footer

**Command**:
One entry of the single action vocabulary the palette, the keyboard help and every shortcut resolve
through. — `REQ-SHELL` commands, shortcuts, palette
_Avoid_: action, shortcut (a shortcut *invokes* a command)

**Overlay drawer**:
What a pane becomes in the compact layout. — `REQ-SHELL` compact layout and overlay drawers

**Pane**:
A user-resizable region whose divider position persists. — `REQ-SHELL-069`

**Persona window**:
An auxiliary window showing one persona's own work. — `REQ-SHELL` agent pop-out windows
_Avoid_: agent window in code that also means the persona vocabulary; both spellings are the
specification's, and the window is per persona

**Terminal window**:
The pop-out window carrying an interactive character-grid terminal. — `REQ-SHELL-079`

**Preference store**:
The single per-user store of shell preferences, with a **closed** slash-namespaced key registry: a
key absent from the registry does not exist. — `REQ-SHELL-006`
_Avoid_: local storage, app settings, user config (that is the YAML global scope)

**Theme**:
A named appearance the shell renders in, with accessibility floors that hold whichever is
selected. — `REQ-SHELL` theming

**Diagnostics capture**:
The opt-in, bounded, content-free UI trace, at level `off`, `light`, or `deep`. — `REQ-SHELL-163`

### The conversation

**Composer**:
The input that adapts to run state — start a run, continue a session, or queue a follow-up.
Steering a live agent is **not** a composer mode. — `REQ-CHAT` overview
_Avoid_: input box, prompt bar, chat box

**Continue action**:
On a `paused` session, the composer's "Continue run": it continues the session, and where the last run left an
iteration open the composer states how many agents will resume (the open iteration's root and every unfinished agent)
and offers "Continue without them", which, once confirmed, ends those agents `cancelled` and continues as a new
iteration. Resuming is the default. — `PD-ORCH-005` clause 6, `REQ-MONITOR-125`
_Avoid_: resume button, restart

**Draft**:
The one in-progress composer text, persisted per workspace. Distinct from the
[Library](../engine/src/artifacts/CONTEXT.md)'s **stash**, which is a collection. — `REQ-CHAT-015`

**Slash command**:
A typeable command invoked from the composer, with inline discovery and validation. — `REQ-CHAT-018`

**Transcript**:
The live rendering of a session's rows. There is exactly one transcript store, on disk or anywhere
else, and the transcript projects from it. — `REQ-CHAT-165`, `REQ-CHAT` transcript model and
projection
_Avoid_: chat log, history (the **event history** is a different record), feed

**Row**:
One entry of the transcript. — `REQ-CHAT-046`

**Row category**:
What a row is, from a vocabulary of exactly twelve: agent message, tool call, system notice, user
prompt, intent note, structured-question prompt, approval prompt, user-only edit diff, streamed
reasoning, delegation-context header, verifier output, and folded tool group. — `REQ-CHAT-046`

**Row role**:
The persisted role a row carries, from an **open** vocabulary: five names project to a kind of their
own and any other role is legitimate and projects to a message row carrying that role as its display
name — an agent's own name being the ordinary case. Never treat the five as exhaustive. —
`REQ-CHAT-047`

**Tool row status**:
`running`, `ok`, `failed`, or `blocked`, where `blocked` covers every case in which no outcome was
observed and must convey which. — `REQ-MONITOR-105`

**Folded tool group**:
Consecutive tool calls presented as one collapsible row. — `REQ-CHAT-046`

**Question stepper**:
The surface that walks a user through a structured question raised by an agent. — `REQ-CHAT` §17
_Avoid_: wizard, form

### Telling the user

**Acknowledgement**:
The transient feedback surface, of kind `info`, `ok`, `warn`, or `fail`, ascending. — `REQ-NOTIFY-018`
_Avoid_: toast, snackbar, flash

**Notice**:
The persistent feedback surface, carrying an id, a severity, a title, a message, copyable details,
an optional action and an owning session. — `REQ-NOTIFY-023`
_Avoid_: alert, banner (the update **banner** is its own named surface), notification

**Notice severity**:
`info`, `success`, `warning`, `error`, ascending. — `REQ-NOTIFY-023`

**Notice action**:
An opaque identifier carrying what a notice's control does, drawn from a closed vocabulary. No
action in it performs work in the user's project: each either navigates or acts on application state
the user has already agreed to. — `REQ-NOTIFY-044`

**Normalised run lifecycle**:
The presentation vocabulary a persisted execution status is mapped onto: `cancelling`, `completed`,
`failed`, `idle`, `paused`, `pausing`, `running`, `starting`, `stopped`. Never store one. —
`REQ-NOTIFY-048`
_Avoid_: `cancelled` — withdrawn from this vocabulary, with `stopped` holding its place
