# Requirements

A project's own requirements, kept as versioned documents in its own repository, compiled into
symbols that implementing code and covering tests reference; and the board on which a person reads
their health and moves work along. Every artifact described here is a **file in the user's own
repository** and stays one.

Terms are derived from `docs/spec/08-requirements-traceability.md`. This context covers both
`traceability/` (the store, the sweep, the checks) and `delivery/` (the board's own state), because
they are one language.

> These are the terms for **a user's project's** requirements. Rotaris's own requirements — the
> `REQ-<DOMAIN>-<NNN>` identifiers in `docs/spec/` — are specification, not product data. The words
> below name what the product manipulates; do not use them for this repository's own gate process.

## Language

### The store

**Requirement store**:
The set of requirement documents a project keeps in its own repository, discovered by a configured
layout. — `REQ-TRACE` requirement store: layout and discovery
_Avoid_: database, backlog, tracker

**Requirement document**:
One Markdown file with frontmatter declaring one identifier or several. A key outside the known set
is carried through untouched and otherwise ignored, so adding a field to a project's own template
never becomes a repository-wide parse failure. — `REQ-TRACE-014`

**Identifier**:
A project's uppercase prefix, a hyphen and decimal digits, and nothing else. The prefix is declared
by the layout and never inferred from the documents. Identifiers are globally unique, never
renumbered and never reused; a deleted requirement leaves a permanent gap. — `REQ-TRACE-022`,
`REQ-TRACE-023`, `REQ-TRACE-024`

**Epic**:
A requirement numbered `x00`, realised through the requirements of its own hundreds-block. —
`REQ-TRACE-024`

**Lifecycle**:
A requirement's status, exactly `draft`, `approved`, or `deprecated`. Nothing at all is enforced for
a `draft`; `approved` is what makes traceability and coverage owed; every reference to a
`deprecated` requirement warns and never errors. — `REQ-TRACE-016`
_Avoid_: state (reserved for **delivery state**), status (ambiguous here — say lifecycle)

**Obligation**:
Whether an implementation reference (`trace`) and a covering test reference (`test`) are owed,
`required` or `optional`, defaulting to required. — `REQ-TRACE-017`

**Technical requirement**:
A requirement of `type: technical`, which must declare what it is `derived-from`. The default type
is `product`. — `REQ-TRACE-014`, `REQ-TRACE-019`

**Legacy identifier**:
An optional provenance field, explicitly **not** unique across documents. One claimed by two or more
requirements resolves to nothing. — `REQ-TRACE-015`, `REQ-TRACE-021`

### Compiling and checking

**Generated symbol artifact**:
The source file compiled from the store, holding one integer-valued enumeration member per
requirement plus its metadata. Generated, never hand-edited. — `REQ-TRACE` generated
requirement-symbol artifact
_Avoid_: bindings, stubs

**Annotation**:
A reference on implementing code or a covering test naming a generated symbol. — `REQ-TRACE` link
declaration: annotations

**Sweep**:
The pass over the repository that collects annotations. — `REQ-TRACE` repository sweep

**Verification pass**:
The check that every approved requirement is implemented and covered, that no annotation names a
requirement that no longer exists, and that a requirement whose text changed has had its sites
revisited. It **is pure**: it writes nothing, and plain checking never writes. — `REQ-TRACE-090`
_Avoid_: validation, lint

**Orphan**:
A production module with no requirement behind it, or a test tracing to none. — `REQ-TRACE` orphan
code, orphan tests

**Debt baseline**:
A shrink-only ratchet listing what is currently unmet, so existing debt does not block work while
new debt cannot be added. — `REQ-TRACE` debt baselines
_Avoid_: allowlist, waiver, suppression

**Tombstone**:
The record of a retired identifier, so a number is never quietly reused. — `REQ-TRACE` retired
identifiers

**Content hash**, **canonical hash**, **global fingerprint**:
Three distinct digests, told apart by length: 16 characters over the whole normalised document, 32
characters over one identifier's own normalised payload and prose, and a full 64-character digest
over the whole store. They are not interchangeable. — `REQ-TRACE` hashes

**Layout configuration**:
The JSON document at the repository root declaring where the store is and what prefix it uses. It is
JSON, not YAML, so the engine can run wherever it is embedded without a project environment. —
`REQ-TRACE-013`, `REQ-TRACE-039`, `REQ-TRACE-040`

### The board

**Board**:
The primary view presenting every requirement as a card in a column. Nothing is ever written by
merely looking at it. — `REQ-TRACE-230`
_Avoid_: kanban, dashboard (the **Overview** is the dashboard)

**Delivery state**:
Where a requirement has reached along the pipeline, in this fixed order: `backlog`, `ready`,
`running`, `review`, `needs-update`, `done`. The order is fixed and never derived from data. —
`REQ-TRACE-232`
_Avoid_: stage, column (a column *renders* a state), lifecycle

**Blocked**:
A **condition**, deliberately not a delivery state. A blocked requirement still belongs to the state
it occupied when it became blocked, and clearing the blocker returns it to precisely that state and
no other. — `REQ-TRACE-233`

**Health**:
One of seven words derived from lifecycle, delivery state and evidence together, and set by nobody
directly: `healthy`, `needs-update`, `incomplete-traceability`, `verification-failed`, `blocked`,
`superseded`, `deprecated`. — `REQ-TRACE-252`

**Card**:
One requirement on the board, carrying seven facts no card omits: identifier, title, lifecycle
badge, delivery condition, evidence indicator, execution-unit count, and how long ago the most
recent run happened. — `REQ-TRACE-242`

**Evidence obligation**:
What a requirement owes, in indicator order: `implementation-trace`, `covering-test`,
`verification`. — `REQ-TRACE-258`

**Recorded evidence**:
What was actually found for an obligation: `satisfied`, `stale`, `failed`. — `REQ-TRACE-270`

**Execution unit**:
The slice of a requirement a single run takes on. Its branch is derived from the requirement
identifier and the unit id. — `REQ-TRACE` board tokens, `REQ-GIT-074`
_Avoid_: task, ticket, story

**Board action**:
One member of the closed write-back set: `release`, `return`, `accept`, `rerun`, `send-back`,
`reject`, `hold`, `resume`, `answer-blocker`, `edit`, `create`, `accept-proposal`,
`accept-change-work`, `keep-worktree`. — `REQ-TRACE-382`

**Actor**:
Who a state change is attributed to. Every change is passed to the engine, attributed and recorded.
— `REQ-TRACE` refusals, guards and attribution

**Blocker**:
A recorded reason a requirement cannot proceed, of kind `dependency`, `conflict`, `decision`,
`run-failure`, or `stated`. — `REQ-TRACE-446`

**Release gate**:
What must hold before work is released, including the chain of blockers behind it. — `REQ-TRACE`
release gate and blocker chain

**Review**:
The surface on which a finished run's result is read and decided — accept, rerun, send-back, edit,
reject, keep-worktree — laid out as claim, measurement and work. — `REQ-TRACE-420`,
`REQ-TRACE-422`

**Delivery queue**:
What picks the next candidate up, `manual` or `automatic`, bounded by a concurrency limit. —
`REQ-TRACE-479`, `REQ-TRACE-483`

**Disclosure**:
The declaration, at the first action of a launch that would start a run, of the permissions the run
receives and the worktree it is confined to, with a way to abandon. It is `due` until accepted;
accepted, it is `accepted` for the remainder of that launch of the application; accepted
permanently it is `suppressed` in later launches; switched off in settings it is `off`, and
the run adopts the workspace's own permission mode; a workspace that already runs unattended needs
none. Declining it changes nothing. — `REQ-TRACE-472`, `REQ-TRACE-474`
_Avoid_: consent, warning, prompt

**Grouping axis**:
What the board's columns mean: `delivery` (default), `health`, `lifecycle`, `epic`, `priority`,
`source`. — `REQ-TRACE-293`

**Requirement source**:
A configured origin of requirement documents, of type `reqtocode`, `markdown`, `yaml` or `json`,
which may or may not declare the create capability and may or may not be writable. — `REQ-CONFIG`
vocabularies
