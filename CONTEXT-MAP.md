# Context Map

Rotaris is one desktop application whose **packages** follow process boundaries
(`docs/architecture/views/01-component-view.md`). Its **language** does not: it follows the
behavioural domains of `docs/spec/`, each of which owns a prefix (`REQ-ORCH`, `REQ-TRACE`, …).
This map names the contexts, says where each one's glossary lives, and records how they relate.

## How these glossaries are written

Three rules, and they are not negotiable in this repository.

1. **Derived, never coined.** Every term here is taken from `docs/spec/`. If a word is needed and
   the specification does not have one, that is an open question against the requirement, not a
   licence to invent. A term with no citation is a defect.
2. **One owner per term.** The specification already works this way — a domain that needs another
   domain's vocabulary cites the owning requirement and "holds no copy of it". These glossaries
   mirror that: a term is defined in exactly one context and referenced from the others. Copying a
   definition across two files is how the two drift.
3. **Every entry cites its owning requirement.** This departs from the plain
   `CONTEXT.md` format on purpose: `AGENTS.md` requires implementation work to cite the requirement
   IDs it rests on, and a citation is what makes "derived, never coined" checkable by a reader.

Definitions state what a thing **is**. Rules, defaults, figures and shapes stay in `docs/spec/`;
where you need those, follow the citation.

## Contexts

| Context | Glossary | Spec domain | Prefix |
|---|---|---|---|
| Run | [`packages/engine/CONTEXT.md`](./packages/engine/CONTEXT.md) | 01 Run Orchestration, 02 Run Monitoring and Steering | `REQ-ORCH`, `REQ-MONITOR` |
| Session Record | [`packages/store/CONTEXT.md`](./packages/store/CONTEXT.md) | 07 Session Persistence, 20 Event Stream and Export | `REQ-SESSION`, `REQ-EVENTS` |
| Tooling | [`packages/agent-tools/CONTEXT.md`](./packages/agent-tools/CONTEXT.md) | 05 Tools, Permissions and Approvals, 10 Sandbox and Egress | `REQ-TOOLS`, `REQ-SANDBOX` |
| Lifecycle Hooks | [`packages/hooks/CONTEXT.md`](./packages/hooks/CONTEXT.md) | 09 Lifecycle Hooks | `REQ-HOOKS` |
| Providers | [`packages/providers/CONTEXT.md`](./packages/providers/CONTEXT.md) | 04 Model Providers, Sign-In and Routing | `REQ-PROVIDER` |
| Tool Servers | [`packages/mcp/CONTEXT.md`](./packages/mcp/CONTEXT.md) | 16 MCP Server Integration | `REQ-MCP` |
| Configuration | [`packages/config/CONTEXT.md`](./packages/config/CONTEXT.md) | 15 Settings and Configuration | `REQ-CONFIG` |
| Workspace | [`packages/workspace/CONTEXT.md`](./packages/workspace/CONTEXT.md) | 13 Workspace, Context Injection and Onboarding | `REQ-WORKSPACE` |
| Version Control | [`packages/workspace/src/git/CONTEXT.md`](./packages/workspace/src/git/CONTEXT.md) | 06 Git, Worktrees and Checkpoints | `REQ-GIT` |
| Requirements | [`packages/workspace/src/traceability/CONTEXT.md`](./packages/workspace/src/traceability/CONTEXT.md) | 08 Requirements Board and Traceability | `REQ-TRACE` |
| Library | [`packages/engine/src/artifacts/CONTEXT.md`](./packages/engine/src/artifacts/CONTEXT.md) | 14 Library, Artifacts and Improvements | `REQ-LIBRARY` |
| Shell | [`packages/ui/CONTEXT.md`](./packages/ui/CONTEXT.md) | 12 Desktop Shell, 03 Conversation and Transcript, 19 Notifications and Recovery | `REQ-SHELL`, `REQ-CHAT`, `REQ-NOTIFY` |
| Distribution | [`packages/shell/CONTEXT.md`](./packages/shell/CONTEXT.md) | 11 Startup, Distribution and Updates | `REQ-STARTUP` |

A context's glossary sits at the package that owns its language, not at every package that consumes
it. `packages/workspace/` carries three: the workspace itself at the package root, version control
and requirements in their own subtrees, because the three share a directory and share no vocabulary.

**Not yet written.** Domain 21 (UI Performance Benchmark, `REQ-UIBENCH`, peripheral) has no glossary
here. Domains 17 (`REQ-TUI`) and 18 (`REQ-CLI`) are **retired** — the product has no terminal UI and
no command-line interface — and will never have one; a term reached from either series is withdrawn
vocabulary and must not be revived.

## Relationships

Read these as "who cites whom", in the specification's own sense: the second context owns the
vocabulary, the first uses it without holding a copy.

- **Run → Tooling**: the run delegates through a tool call, so the delegation observation and its
  status set belong to Tooling (`REQ-TOOLS-152`, `REQ-TOOLS-153`), not to the run that reads it.
- **Run → Session Record**: the run's own statuses are the persisted execution-status vocabulary
  (`REQ-SESSION-073`); a run does not mint a status of its own.
- **Tooling → Session Record**: the permission audit, the tool-call evidence record and the
  verification-gate record are session records; Tooling fixes what goes in an entry, Session Record
  fixes where entries live and what leaves the application.
- **Session Record → Run**: an event's `status` and `stop_reason` are the run's closed sets
  (`REQ-ORCH-083`, `REQ-MONITOR-301`); the stream carries them and defines neither.
- **Configuration → everything**: nearly every vocabulary Configuration accepts as a value is fixed
  by the domain that owns the behaviour (permission mode, transport, hook event, egress
  disposition); Configuration owns the key, the scope and the precedence, and cites the rest.
- **Providers → Configuration**: the discovery snapshot is a configuration layer, so the model slots
  and tier aliases it fills are Configuration's vocabulary.
- **Requirements → Version Control**: a unit run occupies a branch and a worktree named by Version
  Control's templates (`REQ-GIT-074`, `REQ-GIT-137`); the board names neither.
- **Requirements → Run**: the board releases work by starting a run; everything about how that run
  behaves is the Run context's.
- **Library → Version Control**: improvement checkpoints are checkpoints, in their own disjoint ref
  namespace.
- **Shell → all of them**: the shell renders other contexts' vocabularies and owns almost none of
  them. Where a status reaches the screen, the screen's normalisation is Shell's
  (`REQ-NOTIFY-048`) and the underlying value is its own domain's.
- **Workspace → Lifecycle Hooks**: the trust gate is a workspace decision over a hook digest the
  Hooks context defines (`REQ-HOOKS-091`).

## Where the structure comes from

Which views exist, what they are called and what is on them come from `docs/spec/`
(`REQ-SHELL-023` fixes the seven primary views). `docs/design/` is adopted for the design language
and **not** for information architecture — see `docs/design/README.md` §2. No glossary here may be
used to introduce a screen, a tab or a field the specification does not state.
