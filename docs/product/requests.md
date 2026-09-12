# Request log

Every request the owner makes that could change what the product does, logged **when it is made** —
before it is classified, and before any code is written.

The log exists because the failure it prevents is silent: a request arrives in conversation, an agent
builds it, and the behaviour lands in the product with no identifier against it, invisible to
traceability and to the clean-room argument. A row here is cheap. Reconstructing one afterwards is
not possible.

**Declined and deferred requests stay.** A refusal with no record can be asked again in three weeks
and answered differently, and nobody can see that it happened. The reason is part of the row.

- Identifiers: `R-NNN`, contiguous from 1, never renumbered and never reused.
- **Classification** is one of the five in [`README.md`](README.md)'s table: `covered`, `question`,
  `escalation`, `defect`, `directive`.
- **Disposition** names where it landed — a `PD`, a `REQ` it turned out to be covered by, an `OQ`, an
  `ESC`, or `declined` / `deferred` with the reason.
- A row is **appended and never rewritten**. A request that changes gets a new row citing the old one.

## Count

**Seven.** The count is the number of rows below.

---

| # | Date | The request, in the owner's terms | Classification | Disposition |
|---|---|---|---|---|
| <a id="r-001"></a>R-001 | 2026-09-12 | "is there a way to open a workspace already if none is open in the app currently?", then "plan out that implementation" | covered | REQ-SHELL-010, REQ-SHELL-011, REQ-SHELL-017..021, REQ-WORKSPACE-005..013 already state the whole flow; nothing minted. It was unbuilt, not unspecified |
| <a id="r-002"></a>R-002 | 2026-09-12 | "we can have multiple workspaces running on different projects … at the same time in different fully fledged windows, giving the user the impression that multiple instances are running?" | covered | REQ-STARTUP-161 ("several workspaces and several windows are not a second instance"), REQ-STARTUP-162, REQ-STARTUP-163; nothing minted |
| <a id="r-003"></a>R-003 | 2026-09-12 | "this should also support the user launching two parallel instances of the app independently from one another in different workspaces" | declined | REQ-STARTUP-161: "at most one instance … SHALL run per user account", and its last sentence forbids defining any interface control by which a second instance can be started. Two processes would also mean two run hosts, two credential stores and two claims over one workspace store, which spike 19 measured as data loss. The owner's intent is met in full by several main windows of the one instance ([R-002](#r-002)) |
| <a id="r-004"></a>R-004 | 2026-09-12 | "when the user opens a new workspace he gets the option to open it in a new window" | directive | [`PD-SHELL-001`](directives.md#pd-shell-001) |
| <a id="r-005"></a>R-005 | 2026-09-12 | "if he tries to open two in the same workspace he gets the option to launch a new session / run instead (which will have the same effect as the users intent is to work on multiple things in paralell)" | directive | [`PD-WORKSPACE-001`](directives.md#pd-workspace-001) |
| <a id="r-006"></a>R-006 | 2026-09-12 | "record a new product spec and wire up the report.commands at a meaningful - UX in mind - place" | directive | [`PD-LIBRARY-001`](directives.md#pd-library-001) |
| <a id="r-007"></a>R-007 | 2026-09-12 | "identify our skills in the repo, the instructions and workflows so far and see if we could optimize ui generation and debugging based on these insights", followed by "Implement the plan." | covered | The adopted design language and its fidelity workflow govern generation (`docs/design/README.md` section 7); REQ-SHELL-128..160 govern rendered theme, focus, scale, contrast and completeness evidence; REQ-WORKSPACE-051 and REQ-WORKSPACE-053 govern repository-local portable-skill discovery and shape. The implementation adds repository workflow, shared UI components and verification evidence within those bounds |

<!--
Row shape:

| <a id="r-001"></a>R-001 | 2026-09-12 | "the composer should show which model the next run uses" | directive | [`PD-CHAT-001`](directives.md#pd-chat-001) |
| <a id="r-002"></a>R-002 | 2026-09-12 | "add a dark-mode toggle to the title bar" | covered | REQ-SHELL-128 already states it; nothing minted |
| <a id="r-003"></a>R-003 | 2026-09-12 | "let a run write outside the workspace" | declined | crosses REQ-SANDBOX-001's confinement; the owner withdrew it the same day |
-->
