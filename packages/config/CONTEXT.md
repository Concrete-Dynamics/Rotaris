# Configuration

Optional YAML in two directory scopes, folded together with built-in defaults, auto-discovered
tool-server declarations and a machine-written discovery snapshot into a single validated
configuration on every load. Absence of every configuration file is a normal state.

Terms are derived from `docs/spec/15-settings-configuration.md`. This context owns keys, scopes,
precedence and the settings surface; the **values** those keys accept are almost always another
domain's closed vocabulary, cited and never copied.

## Language

### Sources and layering

**Scope**:
One of the two directory locations configuration is read from — the per-user **global** directory
and the per-workspace `.rotaris/` directory. — `REQ-CONFIG-001`
_Avoid_: level, tier (a **tier alias** is a model concept), environment

**Effective configuration**:
The single validated result of a load: defaults, then global, then workspace, then discovery,
folded together. Precedence is fixed and total, the overlay is at most one level deep, and lists
never append. — `REQ-CONFIG` layering and precedence
_Avoid_: merged config, resolved settings

**Merge discipline**:
The stated rule for how one layer combines with another for a given shape — which is why a list
never appends and a nested map never merges two levels down. — `REQ-CONFIG` merge disciplines

**Section**:
One named block of the primary document, owned by the domain whose behaviour it configures. —
`REQ-CONFIG` top-level keys

**Primary configuration document**:
`agents.yaml`, in either scope. A malformed primary file **aborts the load** with a message naming
the file; this is not a recoverable state. — `REQ-CONFIG` file format and parse-time error semantics

**Discovery snapshot**:
The machine-written provider and model record merged in at load time. It is not hand-edited and is
not a place a user states intent. — `REQ-CONFIG` provider/model discovery snapshot
_Avoid_: cache, generated config

**Secrets document**:
`secrets.yaml`, per scope, beside `agents.yaml`. Workspace beats global per key; malformed content
loads as empty. — `REQ-CONFIG-216`

**Bootstrap**:
The minimal configuration written on first run so that a new workspace loads on something rather
than nothing. — `REQ-CONFIG` first-run bootstrap

**Placeholder expansion**:
The substitution applied to a discovered declaration's values, so that a third-party file naming an
environment variable or a workspace folder resolves. — `REQ-CONFIG` third-party discovery

### Failure

**Fatal load failure**:
A configuration failure that stops the load, with a stated message and a stated way for a user to
recover. — `REQ-CONFIG-478`
Under one, the workspace still opens (its window, history, repository view and Settings) and its configuration does not:
the report is raised as a persistent error notice when the workspace opens, and every run and isolated start is refused
until a later load succeeds (OQ-279, ruled 2026-10-13 under R-072).

**Withdrawn key**:
A key this specification once defined and has withdrawn, or one it names as not a configuration key
of its domain. It is **reported and ignored** rather than fatal, and the product never edits the
user's file to repair it. — `REQ-CONFIG-183`
_Avoid_: deprecated key, legacy key

**Unknown key**:
A key this specification has never defined. Under `requirements:` this is an unweakened hard load
failure — distinct from a withdrawn key, deliberately. — `REQ-CONFIG-183`

### The settings surface

**Settings category**:
One entry of the closed navigation set of the settings screen: `models`, `personas`, `runtime`,
`interface`, `display`, `skills`, `instructions`, `hooks`, `mcp`, `plugins`, `tools`, `project`,
`about`. — `REQ-CONFIG-269`
_Avoid_: tab, page, section (a **section** is a block of the document, not a screen)

**Deferred edit**:
A change the settings screen holds until an explicit Save, revertible by Discard. — `REQ-CONFIG`
settings screen: save, discard and dirty state
_Avoid_: draft (that is a composer term), pending change

**Preference**:
A change committed immediately, outside Save, and persisted per user rather than in either YAML
scope. — `REQ-CONFIG-405`
_Avoid_: setting, option — both blur the line this term exists to draw

**Per-field write**:
The scoped write path by which one field is persisted without rewriting the surrounding document,
preserving what the product does not model. — `REQ-CONFIG` the scoped per-field write path

**Reload**:
The immediate re-load that follows a save, so a change is observable without a restart. Every key
outside the settings screen's subset takes effect at the next load instead. — `REQ-CONFIG` when a
change takes effect

**Widening confirmation**:
The explicit confirmation demanded before a change that widens what an agent may reach. —
`REQ-CONFIG` settings screen: security policy controls and confirmations

### Project initialization

**Initialization task**: One-time work a workspace owes, described by an id, a display label, a
description, an applicability predicate, a runner and a consent flag. The product ships exactly one.
— `REQ-WORKSPACE-080`, `REQ-WORKSPACE-088`
_Avoid_: setup step (that is one stage **inside** a task, `REQ-WORKSPACE-091`), onboarding step

**Applicable / pending / runnable / background / consent task**: Five readings of the same set and
not synonyms. *Applicable* is the predicate satisfied whatever is recorded; *pending* is applicable
and in neither persisted list; *runnable* is applicable and not completed, so a **skipped task stays
runnable**; *background* is pending and needing no consent; *consent* is pending and needing it.
— `REQ-WORKSPACE-081`
_Avoid_: outstanding, due, owed — each collapses two of the five

**Initialization marker**: The `initialization:` section of the workspace `agents.yaml` — the
completed list, the skipped list, `last_run` and `classification` — with exactly one writer.
— `REQ-WORKSPACE-078`, `REQ-WORKSPACE-085`
_Avoid_: initialization state (that is the nine values a surface works from, `REQ-WORKSPACE-105`),
flag, sentinel

**Never initialized**: No `last_run` **and** both lists empty. A `last_run` stamp alone has left the
state, which is what stops a workspace where no task applied from prompting again.
— `REQ-WORKSPACE-078`, `REQ-WORKSPACE-079`

**Classification**: The verdict `code` or `non-code`, decided by whether any file beneath the
workspace root carries an extension from the configured source-extension set, the root `.gitignore`
honoured. One reading serves both the recorded value and the setup stages' skip.
— `REQ-WORKSPACE-098`, `REQ-WORKSPACE-101`
_Avoid_: project type, language detection — neither is what is decided or why

**Setup prompt**: The consent question, owed exactly when a consent-requiring task is pending. It is
the only thing in this domain that gates agent execution, and it gates only the composer.
— `REQ-WORKSPACE-082`, `REQ-WORKSPACE-112`, `REQ-WORKSPACE-142`
_Avoid_: onboarding dialog, first-run wizard
