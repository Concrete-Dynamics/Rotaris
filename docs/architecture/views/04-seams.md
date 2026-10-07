# Seams — what to touch, in what order, to add one of the things this product adds most often

The other three views answer *what exists*. This one answers *where an addition lands*. Each seam below is
a vertical cut through the packages: the files in the order they must be edited, the invariant that holds at
each stop, and the evidence that re-verifies it.

What is deliberately **not** here: anything the code graph already answers. A symbol's location, a caller list
and a type's shape are one query away. What a query cannot give is the order, the stop that is easy to miss,
and the rule that makes the stop mandatory — and those are what cost an agent a morning.

Every seam ends the same way: **update the view that covers it in the same commit** (`views/README.md`).

| Seam | Add this when | Section |
|---|---|---|
| A renderer command | a surface must ask the application for something | [§1](#1-a-renderer-command) |
| A main → renderer channel | the application must tell a surface something unasked | [§2](#2-a-main--renderer-channel) |
| A store table or column | a fact must survive the process that wrote it | [§3](#3-a-store-table-or-column) |
| A tool | an agent must be able to do something new | [§4](#4-a-tool) |
| A configuration key | the owner must be able to set something | [§5](#5-a-configuration-key) |
| A notice or acknowledgement | the person must be told something | [§6](#6-a-notice-or-an-acknowledgement) |
| A preference key | a window must remember something | [§7](#7-a-preference-key) |
| A drawn surface | anything is drawn, redrawn or restyled | [§8](#8-a-drawn-surface) |

---

## 1. A renderer command

The renderer's only outward path. One IPC channel carries every kind; the union discriminates.

| # | File | What lands here |
|---|---|---|
| 1 | `packages/contracts/src/commands.ts` | a member of `CommandRequestSchema` (discriminated on `kind`). The answer is always `CommandOutcomeSchema`: `{ok: true, value?}` or `{ok: false, code, headline, detail?}` |
| 2 | `apps/desktop/src/main/commands/<facet>.ts` | the handler, filed under its kind: main answers it (preferences, theme, providers, windows, dialogs) **or** relays it |
| 3 | `packages/contracts/src/process-protocol.ts` | only if it relays: the request and reply that cross to a child |
| 4 | `apps/desktop/src/run-host/dispatch.ts` or `apps/desktop/src/workspace-service/index.ts` | the child's own dispatch `switch` — in the run host over the `RunHost` it is handed, never over module scope |
| 5 | `apps/desktop/src/renderer/session-actions.ts`, else the window's own root | the send — a surface takes a callback and never the bridge |

**Which side of the renderer.** A surface in `packages/ui/src/` holds no bridge: it takes a callback and returns
a result. The window's root is what sends, and which root depends on what the command is about. A gesture against
**the session this window follows** belongs in `apps/desktop/src/renderer/session-actions.ts` — resolve focus to a
session id, send one command, turn anything that is not a success into a sentence a surface can show — and adding
it there gives it to every window at once, because `shell.ts` makes that set one per window. Anything a window
reads or writes for itself stays in the root that draws it: `main.tsx` for the main window's six views,
`windows.tsx` for the approval, provider, pause, hook-review, persona and terminal windows.

**Which facet.** Nineteen sit beside `commands/context.ts`, one per family: `dialogs`, `providers`, `session`,
`hooks`, `mcp`, `initialization`, `skills`, `shell`, `git`, `checkpoints`, `library`, `improvements`, `config`,
`requirements`, `windows`, `workspace`, `update` (the updater's), `auth-recovery` (REQ-NOTIFY-072's recovery window,
2026-10-02; this line said sixteen until then, `update` uncounted) and `reauth` (REQ-NOTIFY-071/078's prompt, 2026-10-02).
Add the kind to the one whose name it already carries; a family with no
facet yet is a new file and one more spread in the table. Each declares the slice of `CommandContext` it uses
(`Pick<CommandContext, 'runHost' | …>`) — take what you need and nothing more, because that slice is what a
test has to satisfy. A member that does not exist yet is added to `CommandContext` and supplied in `index.ts`.

**There is no `default`.** `CommandHandlers` is total over `CommandRequest['kind']`, so a kind added at stop 1
and to no facet **fails to compile** at the table in `index.ts` rather than answering `command.unimplemented`
at run time. That is the point of stop 2: you cannot forget it, and you do not have to read a thousand-line
`switch` to find where it goes.

**The preload is not a stop.** It exposes one `command` method for every kind; only a *channel* (§2) adds a
method there.

Invariants:

- A command is answered **for the window that raised it** — `MainWindows.forCommand(senderId)`: the sender's main
  window, else the main window owning the persona or terminal window that sent it, else the active window — not for
  "the main window" (`REQ-SHELL-020`, `REQ-STARTUP-163`). With two main windows alive those are different answers.
- A request that does not parse is `command.malformed`. Nothing throws out of `runCommand`: an uncaught
  exception in main raises the platform's native error box and wedges the loop (`ADR-0019`). `runCommand`
  itself is now three moves — resolve the window, read the request, call the handler — and holds no case.
- **A renderer may not name a workspace, a preference key family or a session it was not given.** Main resolves
  the per-workspace key from the window it opened — that is what makes the composer draft and the requirement
  folds safe. Copy that discipline rather than adding a parameter.
- Main never opens the store, never reads `agents.yaml`, never hands a credential to a renderer (W-01).

Evidence: `pnpm app:drive command …` drives `runCommand` itself, so the command is exercised by the same path
the renderer reaches. A facet is also reachable **without a process at all** — satisfy its slice of
`CommandContext` with plain objects and call the handler (`commands/mcp.test.ts` is the worked example).
Update the process view's **renderer → main** list.

---

## 2. A main → renderer channel

Thirteen exist. A fourteenth is a real decision — ask whether an existing one carries it first. The thirteenth,
`reauth:prompt` (2026-10-02, REQ-NOTIFY-071), was that decision taken: the re-authentication prompt is window-scoped
state main opens and closes on its own account (after a fallback restart), which neither the notice slot (one notice,
any session) nor channel 12 (one workspace's initialization) could carry without changing what they mean. It is the
worked example of a **window-level non-modal surface fed by main** (ADR-0048): the payload schema and the two commands
in `packages/contracts/src/reauth.ts`, the counter in `packages/shell/src/relay.ts`'s total record, the publisher in
`main/index.ts` sending each opening and closing, keyed by session, to every main window, the state in
`main/auth-fallback.ts` (`failure-recovery.ts` until the merge beside the recovery dialog, 2026-10-02; the dialog's opening
closes every prompt through it, REQ-NOTIFY-079), the facet `main/commands/reauth.ts` (the two answers, and `reauth.read` for a window that
mounts later), the hook in `renderer/main.tsx` holding the prompts by session and choosing the followed session's
(`reauthPromptFor`, REQ-NOTIFY-030: a recovery affordance moves with the focused session), and the surface
`packages/ui/src/ReauthPrompt.tsx`, drawn **in flow** by the Workspace view (`WorkspaceView`'s `reauthPrompt`) as its
own row of the view's grid, `reauth`, between the run header and the transcript (OQ-181's reading, confirmed 2026-10-06 by R-071, of "beside the
continuing run") — so a panel open until answered overlays no control at any window size. *Corrected 2026-10-02
(the repair rounds):* the first build sent to the one window following the session and mounted the surface beside the
shell, `fixed` at the window's corner like `ProjectSetupDialog`; the verifier measured the session browser, the three
window controls and the notice's dismissal under it, and the prompt staying over whatever session that window focused
next. ~~A window-level non-modal surface goes in the `windowPanel` slot~~ — the second build drew it `absolute` in an
AppShell `windowPanel` slot inside the rail-and-view region, and at 1000x680 the run header's switches and, under a key
field, the composer's submit were under it; the slot is gone. **A non-modal surface that stays open until answered is
laid out in flow, in a row or column of the view it belongs to, never as an overlay**: add its grid area to every
template of that view (`layout-proof` fails a child naming an area the template lacks) and measure it at REQ-SHELL-022's
minimum. **In flow is not enough beside another panel open until answered** (the third repair round, 2026-10-02): an
`auto`-maximum row is grown before a `1fr` one, so beside the expanded plan gate (whose row has no floor once the
transcript is hidden) the prompt took the height first and left the gate's three answers unreachable at 1000x680. Decide
which of the two yields — the one the run is not stopped on — and give it a form whose height is one row of its answers
on the state where they meet (`.workspace[data-plan-gate='1']:not([data-plan-gate-collapsed='1']) > .reauth-prompt`, the
prompt's bar), never a written height, then measure both panels' answers at the minimum in that state. **A window-level dialog that belongs to no view** (REQ-WORKSPACE-106's project setup consent dialog) is the exception
the rule above cannot place: in flow it would take room from every view at the minimum. It goes in AppShell's
`windowDialog` slot, `absolute` against the rail-and-view region (`.body`) at its top corner with the `--rt-space-4`
inset and bounded by that region, so the title bar and the notice slot are never under it, and it lies over the view's
corner while open (OQ-187; since 2026-10-02, when it moved off the window's corner,
`../../defects/fixed/the-project-setup-dialog-is-drawn-over-the-title-bar-window-controls.md`). Measure the chrome's and
the notice's buttons at their centres with it open (`init-proof`'s `consent`).

| # | File | What lands here |
|---|---|---|
| 1 | `packages/contracts/src/channels.ts` | the name in `CHANNEL`, and the payload schema |
| 2 | `packages/contracts/src/commands.ts` — `RendererBridge` | the subscription method's type |
| 3 | `apps/desktop/src/preload/index.ts` | one `subscribe(CHANNEL.…)` entry on the frozen namespace |
| 4 | `apps/desktop/src/main/index.ts` | the publisher — `UpdateRelay` for a session-scoped fan-out, `webContents.send` for a window-scoped one |
| 5 | `packages/ui/src/…` | the subscriber |

Invariants:

- **The preload renumbers nothing and re-derives nothing.** Sequence numbers are the producer's; payloads pass
  through untouched (`ADR-0044`).
- A delivery bound is **one budget across every window taken together**, not one per window. Getting this
  backwards was defect T2-1 on channel 3.
- The relay preserves sequence. A surface that needs ordering gets it from the payload, never from arrival.
- **A dead sink is shed, never thrown on.** A `send` that throws (a disposed render frame) detaches the sink
  from the relay and delivery continues to the survivors (`relaySequenced`, `broadcast`, and the channel-3
  limiter's `send` all isolate per sink). `render-process-gone` detaches the window's sink at once, so the
  crash-without-close path never waits for the next publication. A vanished view leaves the run untouched
  (`REQ-MONITOR-226`'s intent on the delivery path).

Update the process view's **main → renderer** paragraph and the channel list in its diagram.

---

## 3. A store table or column

One writer, one migrator, one version.

| # | File | What lands here |
|---|---|---|
| 1 | `packages/store/src/schema.ts` | a new `Migration` **appended** to `MIGRATIONS`, `to` = the next integer. Never edit a migration that has shipped |
| 2 | `packages/store/src/dal.ts` | the read and write |
| 3 | `packages/engine/src/session-writer.ts` | only if a run writes it — the writer is the run's one way in |
| 4 | `packages/store/src/backup.ts`, `restore.ts` | only if the row must survive a restore |
| 5 | `docs/architecture/views/03-runtime-view.md` §7 | the row in the table, saying which version added it |

Invariants:

- `migrateStore` runs each migration **in one transaction and bumps `user_version` inside it**, so a crash
  leaves a whole version. `CURRENT_SCHEMA_VERSION` is derived from the last entry — never written by hand.
- A store **newer** than the build is not touched and not refused there (`ADR-0058`); what that means for
  opening is the caller's decision.
- **Only the workspace service migrates** (W-02). The run host opens and writes; it never migrates.
- **An index you declare is not an index the planner uses.** Assert the query plan in a test — a dead index was
  the fifth first-execution defect and it cost a mechanism that read as working.

---

## 4. A tool

Fail-closed by construction: the registry removes what it cannot resolve.

| # | File | What lands here |
|---|---|---|
| 1 | `packages/contracts/src/tools.ts` | the name in `PUBLIC_TOOL_NAMES` |
| 2 | `packages/agent-tools/src/registry.ts` | the `DECLARATIONS` entry, and membership of `READ_ONLY_CLASS` / `NETWORK_CLASS` / `COORDINATOR_REMOVES` where it belongs |
| 3 | `packages/agent-tools/src/tools/<name>.ts` | the executor — pure, no `electron`, time from the clock ports only |
| 4 | `apps/desktop/src/run-host/tools.ts` — `executorsFor` | the wiring that makes the declared name callable |
| 5 | `packages/agent-tools/src/gate.ts`, `policy.ts` | only if it needs a rule of its own |
| 6 | `packages/engine/src/run/cut.ts` — `WHOLE_KEYS`, and the key table in `run/cut.test.ts` | only when an argument key holds identifiers, paths or timestamps and its last word does not say so, so an error-path record never cuts it (`PD-SESSION-003` (d)); the table classifies every built-in tool's argument keys |

Invariants:

- **A declared name with no executor is removed from the persona**, not offered and failed. One resolution
  feeds both the prompt listing and the gate, so what the model is told it has is what the gate will allow.
  Each removal is logged with the persona and the control (REQ-TOOLS-006) by `createToolPort`: a narrowing
  control's (`run_allow_list`, `coordinator_only`, `read_only`, `tool_restrictions`) at `info` through
  `ToolPortContext.info`, a prerequisite's (REQ-TOOLS-004's reason codes, `executor_absent` among them) at `warning`.
  `tool_restrictions` binds by the allowed-tool lists `toolRestrictionsFor` reads (OQ-145): the entry naming the persona
  in its own map and in the map of `ToolPortContext.parentPersona`, the persona that delegated the agent. A public tool
  and an MCP tool alike survive only when every list names it (`restrictionsAllow`); an MCP tool is taken off the
  surface before the executors and the prompt section are drawn from it, so what is printed is what is callable (REQ-MCP-062).
  `artifact_write` survives only while the persona's `can_publish_artifacts` is true (REQ-CONFIG-106, REQ-TOOLS-150;
  `Persona.canPublishArtifacts`, carried by `personaResolverFor` with the same stated-or-built-in rule as `coordinator_only`),
  and is otherwise removed as the prerequisite `artifact_publish_not_granted` (REQ-TOOLS-004); no built-in role declares it
  or carries the flag (OQ-212).
- **The gate's refusals before the schema parse run in one order**: REQ-ORCH-153's plan gate, then OQ-213's todo list
  owed before a task's second work item (`GateDeps.todoList`, the entry port's only, where its resolved set holds `todo`).
  A tool whose `DECLARATIONS` entry writes workspace files or runs commands is a **work item** on a direct-work grant
  (`isWorkItem`, `todo-list-gate.ts`), so a new tool of that kind is counted there with no edit; `delegate` always is.
- **The resolution is one function, and `delegate`'s description reads it too** (PD-TOOLS-006 revision 4, OQ-216).
  `resolveAgentGrant` (`run-host/tools.ts`) takes a persona's declared tools through `coordinator_only`, `read_only`, the
  `tool_restrictions` lists and the prerequisites (the persona's own `can_publish_artifacts` among them, OQ-212); an agent's port applies it to itself, and `delegateCatalogue` applies it,
  on a child's terms, to every persona the agent can delegate to, so the facets the description states
  (`renderDelegateCatalogue`, from `DECLARATIONS`) are the grant a child receives. A new tool's facets therefore reach
  every coordinator's description with no edit beyond step 2.
- The gate decides; the executor never asks. An approval travels `gate → presenter → main → dialog` — see
  [`06-sequences.md` §2](06-sequences.md#2-a-permission-approval-end-to-end).
- A tool that reaches the filesystem states its read roots; a tool that reaches the network reads the egress
  policy **from the saved configuration at every call**, not from a value captured at run start.

---

## 5. A configuration key

Three tiers, one writer.

| # | File | What lands here |
|---|---|---|
| 1 | `packages/config/src/sections/<section>.ts` | the schema and the default |
| 2 | `packages/config/src/defaults.ts`, `merge.ts`, `tiers.ts` | the layered merge, if the key is not a plain scalar in an existing section |
| 3 | `packages/config/src/snapshot.ts` | only if layer 3 (the discovery snapshot) supplies it |
| 4 | `packages/config/src/writers.ts` | only if a surface saves it |
| 5 | `apps/desktop/src/run-host/configuration.ts` | Tier B — what a run resolves at start |
| 6 | `packages/ui/src/settings/…` | the Settings surface |

A key the Settings screen *edits* takes four more, and they are the ones a first attempt forgets:
`packages/contracts/src/config.ts` (the snapshot field and the save payload's key), then
`packages/ui/src/settings/config-state.ts` — `PendingSettings`, `pendingFrom`, `rebasePending`,
`PendingChange`, `applyChange` and `savePayload`, in that order. A key touching fewer than all six of
those is a key that saves and does not mark dirty, or marks dirty and does not survive a reload.
`instructions.overrides` (`PD-WORKSPACE-002`) is the worked example, and `skills.overrides` the one
before it.

Invariants:

- **Configuration is resolved once per run start.** A run does not re-read; a surface that changes a value
  changes the next run, not the running one. Two readers deliberately break this and say so where they do:
  the `skills:` section and the `instructions:` policy are read from the **saved** file at each gesture,
  because both gate something happening now rather than a run that started earlier.
- **The workspace service is the only writer** (`config.read` / `config.save` / `config.setField`, each
  followed by the load again). The run host never writes a configuration file.
- The writer **re-emits hand-authored YAML with its comments**. Inline-comment spacing collapsing on
  re-emission was the eleventh first-execution defect — if you touch the writer, prove the comments survive.
- `initialization:` / `project_init:` are read **outside** the layered merge, because `REQ-WORKSPACE-078`
  names one file.
- **A role edit is held per (role, scope), each field within** (`REQ-CONFIG-259`, `REQ-CONFIG-341`'s "pending unset of
  (role, field, scope)"). The pending entry (`PendingRoleEdit`, `ui/src/settings/config-state.ts`), the save contract
  (`RoleEditSchema`: `{ workspace?, global? }`, strict) and the writer (`saveDesktop`'s `roleEditAt`) keep each scope's
  field edits apart, so one role's edits at two scopes, the same field's included, each land in their own file. The
  first repair's one scope per field was falsified by a model Unset at Workspace followed by a model pick at Global
  (2026-10-02).

---

## 6. A notice or an acknowledgement

Two vocabularies, both closed. Widening either is a decision, not an edit.

| # | File | What lands here |
|---|---|---|
| 1 | `packages/contracts/src/notices.ts` | `NOTICE_SEVERITIES` (persistent) and `ACKNOWLEDGEMENT_KINDS` (transient) are closed enumerations |
| 2 | `apps/desktop/src/main/notices.ts` | the single current notice and its serialised chain |
| 3 | channel `notice:current` or `acknowledgement:publish` | persistent versus transient |
| 4 | `packages/ui/src/Notice.tsx`, `Acknowledgements.tsx` | the surface |

Invariants:

- **One notice slot.** A second persistent notice replaces; it does not stack.
- **The one exception is an update in place** (REQ-SHELL-118): `NoticeStore.update(noticeId, patch)` changes the
  notice that is current — same id, on the same serialised chain — and answers false, drawing nothing, when that id is
  no longer current (whatever replaced it stays, REQ-NOTIFY-024). A patch that raises the severity to `warning` or
  `error`, or renames a notice at that severity, is recorded first, as a publication would be (REQ-NOTIFY-268). Only the
  updater's offer uses it today (its download progress, its outcome, its failure); a new notice reaches for `report`.
- **A disabled action carries its reason.** `action.disabled` in `packages/contracts/src/notices.ts` is the
  accessible description REQ-SHELL-118 requires; its presence is the disabled state, and `Notice.tsx` renders the
  control disabled with that text as its description. There is no disabled action without a reason.
- A renderer that must raise a persistent notice sends `notice.report` — it does not draw one. That missing
  entry for a renderer was defect fifty-seven.
- A transient acknowledgement may carry **exactly one** action, from a closed one-member type.
- **An action is dispatched in one place**, `dispatchNoticeAction` in `apps/desktop/src/renderer/main.tsx`; a member
  whose target is not built is logged there and nothing else. `retry-run` has its target since 2026-10-02 (REQ-NOTIFY-045,
  `retryRun` in `apps/desktop/src/renderer/session-actions.ts`, reading the draft the composer last published through
  `composerDraft` in `shell.ts`); no failure notice carries it yet (OQ-178). A blank draft is the engine's to retry
  (`session.retry`, `Sessions.retry`, since 2026-10-02): the last submitted prompt is read over every row with
  `lastSubmittedPrompt` — the one reading the continue, the plan decision and the authentication restarts share — and its
  images are read back by path and digest, so an action never resubmits from what a window happens to hold.

---

## 7. A preference key

| # | File | What lands here |
|---|---|---|
| 1 | `packages/platform/src/preferences.ts` — `PREFERENCE_KEYS` | the key, its coercion and its default |
| 2 | `packages/contracts/src/commands.ts` — `PREFERENCE_COMMAND_KEYS` | **only** if a renderer may read or write it |

Invariants:

- `PREFERENCE_COMMAND_KEYS` is an **allow-list**. A key registered in `PREFERENCE_KEYS` and absent from it is
  main's alone — `workspace/lastOpened` is the worked example, and the asymmetry is deliberate.
- A per-workspace key is **minted by main** from the workspace that window opened (`composerDraftKey`, the
  requirement folds). The renderer sends the literal placeholder or nothing at all, so no window can name
  another window's workspace.

---

## 8. A drawn surface

The design language's pair — consult before, match after (`docs/design/README.md` §7).

| # | Step | Why it is mandatory |
|---|---|---|
| 1 | `pnpm mockup`, read the surface | craft, **never** structure; structure is `docs/spec/` (`REQ-SHELL-023` governs) |
| 2 | Build from `packages/ui/src/design-system/` | `tools/check-ui-language.mjs` refuses a design-equivalent control written anywhere else in `packages/ui/src` or `apps/desktop/src/renderer` |
| 3 | Cite tokens by name | never a literal colour or pixel value |
| 4 | Publish a contract on the root — `layoutContractAttributes` from `design-system/layout-contract.ts` | it marks the box with `data-ui` / `data-ui-contract` (the relations **array**), which is what `pnpm ui-audit` evaluates against live geometry after layout settles. It is the only publisher: `tools/check-ui-language.mjs` (`tools/ui-contract-publisher.mjs`) fails `pnpm lint` on a `data-ui-contract` written anywhere else in the drawing roots, the design system included — a hand-written object on the window controls once made the audit throw on every view |
| 5 | `pnpm build`, then `pnpm app:drive shot` | a PNG an agent can read is the cheapest way to meet "match after drawing" |
| 6 | `pnpm ui-audit`, then `pnpm ui-review` | `shrunkBoxes` (`apps/desktop/scripts/lib/layout-relations.mjs`) is the deterministic guard for UIR-014's whole class — a box standing smaller than its content on an axis that does not scroll — and it asks that of **every marked box**, not only of one that published a relation. An audit expression that throws in the renderer is reported as an **`AUDIT-ERROR`** finding naming the view, the size and the expression (`lib/audit-answer.mjs`), and the sweep goes on, so `report.json` is written for every view; a contract that is not a relations array is a `schema` finding for its own box. Every failing contract is filed under `CONTRACT` with the relation that failed under `relation` (`lib/audit-finding.mjs`), so `report.json`, the summary line and `manifest.json`'s `byKind` never read a failing `containment` contract as the whole-document `CONTAINMENT` sweep; the manifest counts contract failures per relation in `contractsByRelation`. The critic is report-only, at most three iterations |

Tokens alone are not compliance, and a plausible invention is not a third option where the design material
decides.

**A status-strip item** (worked examples: REQ-SANDBOX-121's sandbox indicator, 2026-10-02; the strip rebuilt to
REQ-SHELL-038's list, fin10, the same day). The strip's items are **values**: `stripItems(width, facts)` in
`packages/ui/src/composer.ts` answers them left to right in REQ-SHELL-038's order — the workspace path (the one `link`,
REQ-SHELL-039/040), the branch, a `spacer`, REQ-SHELL-041's safety flags in their fixed order (`statusStripSafetyFlags`;
the sandbox indicator right after the file-access flag, OQ-184's build reading, confirmed 2026-10-06 by R-071), the model, the tokens, the cost when there
is one, the background count — each with REQ-SHELL-038's accessible name (`STRIP_NAMES`), its tooltip as its accessible
description, and REQ-SHELL-047's two thresholds (`STRIP_PATH_MIN_WIDTH` 1180, `STRIP_BACKGROUND_MIN_WIDTH` 1080) applied to
the window's own width. `AppShell` (`packages/ui/src/AppShell.tsx`) only draws them, each through `StatusStripItem`
(`packages/ui/src/StatusStripItem.tsx`): a link as the design system's `Button`, text as a `span`, the spacer taking the
slack and giving it back first. An item that is a workspace path or a branch name carries `middle` (the path link and the
branch item, 2026-10-03): its label is shortened from the middle against the width the row gives it (REQ-WORKSPACE-149
rule 2 — `rowLabel` in `workspace-label.ts`, the canvas measurer in `label-measure.ts`, shared with the title-bar chip), the
box asking the row for its whole label as a flex basis and re-eliding on every ResizeObserver change (and on
`document.fonts`' `loadingdone`), and fixed text after it (the branch's ` ↑{n}`) rides as `suffix`, never shortened; every
other item keeps REQ-SHELL-038's end ellipsis. The path link gives up its width **first** (`flex-shrink: 1000000` on
`.status-strip__link[data-middle='1']`; equal factors let a long path squeeze `main` to `m…` or nothing), and a link whose
label rule 2 hid is hidden whole (`data-label-hidden`), no empty focus stop. The branch item is `middle` only while it shows
a branch name: its detached, non-repository and unread words are never shortened (REQ-GIT-161, OQ-193), and an unborn or
unreadable branch is the empty item (state `empty`: no text, no icon, and `StatusStripItem` draws no `title` and no
`aria-description` for an empty string; REQ-WORKSPACE-020, fin22). A glyph
before the label rides as `icon` (the branch item's `ph-git-branch`, REQ-SHELL-042), coloured by a token in
`.status-strip__icon` so a theme change redraws it. An accessible description that is not the tooltip rides as
`description` — only the branch item's while it names an isolated worktree's branch (REQ-WORKSPACE-020: the base sentence as
the tooltip, the worktree added to the description alone; `branchStripItem`, the ahead count from the snapshot row's
`upstreamAhead`); every other item's description is its `title`. An item is text in the strip's own
craft — the mockup's strip is plain tertiary text at `--rt-text-xs`, mono only for figures — so a new item takes no new
control and no new token. The path, in order: the fact on the record the renderer already receives (`SessionRecord` in
`packages/contracts/src/channels.ts`, filled by `toSessionRecord` in `packages/engine/src/sessions.ts`; a store column
first if no stored fact carries it, §3 — the sandbox item's was v31's `sandbox_backend`), or a command the run host
answers where the fact is the workspace's rather than a session's (`workspace.usage`, §1, for the tokens and cost); a
field on `StripFacts` and its place in `stripItems`, pinned in `composer.test.ts` for every state that shows or hides it
and in `layout-regression.test.ts` for the order at each threshold; then the renderer's `status` memo in
`apps/desktop/src/renderer/main.tsx`, which fills `StripFacts` from the **focused** session's record (so an item re-binds
with focus, REQ-MONITOR-257), the configuration snapshot — every flag a setting decides reads it there, never a boot
answer (`● CB armed` through `stripCircuitBreakerArmed` since 2026-10-03, when a breaker turned off in Settings still read
armed), and main announces each main window and its persona and terminal windows their own workspace's snapshot
(`announceConfig`, `configFamily`, `apps/desktop/src/main/config-broadcast.ts`) — the window's width (`useWindowWidth`,
`apps/desktop/src/renderer/strip-facts.ts`) and the workspace's usage, and memoises on what it shows (REQ-TOOLS-184's
"never redraws when nothing it displays has changed"). Read it in the built app with `pnpm app:drive` at 1000, 1079, 1179
and 1400 px wide (`resize`, then `scrollWidth` against `clientWidth` on `.status-strip`): REQ-SHELL-047 owns the widths at
which an item stops being shown, and an item added without a threshold there is shown at every width, so it must fit
beside the others at REQ-MONITOR-051's 1000 px floor.
