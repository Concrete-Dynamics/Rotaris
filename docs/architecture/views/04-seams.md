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

**Which facet.** Sixteen sit beside `commands/context.ts`, one per family: `dialogs`, `providers`, `session`,
`hooks`, `mcp`, `initialization`, `skills`, `shell`, `git`, `checkpoints`, `library`, `improvements`, `config`,
`requirements`, `windows`, `workspace`. Add the kind to the one whose name it already carries; a family with no
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

- A command is answered **for the window that raised it** — `windowFor(senderId) ?? activeWindow()` — not for
  "the main window" (`REQ-SHELL-020`). With two main windows alive those are different answers.
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

Twelve exist. A thirteenth is a real decision — ask whether an existing one carries it first.

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

Invariants:

- **A declared name with no executor is removed from the persona**, not offered and failed. One resolution
  feeds both the prompt listing and the gate, so what the model is told it has is what the gate will allow.
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

Invariants:

- **Configuration is resolved once per run start.** A run does not re-read; a surface that changes a value
  changes the next run, not the running one.
- **The workspace service is the only writer** (`config.read` / `config.save` / `config.setField`, each
  followed by the load again). The run host never writes a configuration file.
- The writer **re-emits hand-authored YAML with its comments**. Inline-comment spacing collapsing on
  re-emission was the eleventh first-execution defect — if you touch the writer, prove the comments survive.
- `initialization:` / `project_init:` are read **outside** the layered merge, because `REQ-WORKSPACE-078`
  names one file.

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
- A renderer that must raise a persistent notice sends `notice.report` — it does not draw one. That missing
  entry for a renderer was defect fifty-seven.
- A transient acknowledgement may carry **exactly one** action, from a closed one-member type.

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
| 4 | Publish a contract on the root — `layoutContractAttributes` from `design-system/layout-contract.ts` | it marks the box with `data-ui` / `data-ui-contract`, which is what `pnpm ui-audit` evaluates against live geometry after layout settles |
| 5 | `pnpm build`, then `pnpm app:drive shot` | a PNG an agent can read is the cheapest way to meet "match after drawing" |
| 6 | `pnpm ui-audit`, then `pnpm ui-review` | `shrunkBoxes` (`apps/desktop/scripts/lib/layout-relations.mjs`) is the deterministic guard for UIR-014's whole class — a box standing smaller than its content on an axis that does not scroll — and it asks that of **every marked box**, not only of one that published a relation. The critic is report-only, at most three iterations |

Tokens alone are not compliance, and a plausible invention is not a third option where the design material
decides.
