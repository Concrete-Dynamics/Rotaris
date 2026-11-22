# Approval card — brief

**Status:** proposed
**Written:** 2026-11-22 by `design-ui`, for [R-121](../../product/requests.md#r-121) — the remainder of [`PD-CONFIG-014`](../../product/directives/pd-config-014.md#pd-config-014) clause 4 ("showing the key, the scope, the value it holds and the value proposed")
**Surface:** the approval dialog; §7 row "Approval card"; mockup section `WORKSPACE` → the `approvalOn` block; nearest built code `packages/ui/src/ApprovalDialog.tsx`; theme `rotaris-dim`

A brief for one addition to a built surface: the dialog of a `configure` set. Every other request's dialog is unchanged, so the sections below speak of that case alone.

## 1. Authority

- `REQ-TOOLS-063`: the dialog's title, headline, requester line, detail box, fine print, three buttons, no default action and initial focus on Deny.
- `REQ-TOOLS-056`: the approval payload's fields. `PD-CHAT-013`: `call_id` beside them. Both list fields, and the change below adds one.
- `REQ-TOOLS-057`: the argument summary in the detail box, masked and clipped.
- `PD-CONFIG-014` clause 4: an authority set or a global set always asks, showing the key, the scope, the value it holds and the value proposed; no earlier answer pre-approves it.
- `REQ-SHELL-022`: the 560×380 minimum.
- **Departure from REQ-TOOLS-063**, forced by `PD-CONFIG-014` clause 4: the dialog of a `configure` set holds a change block between the requester line and the detail box. REQ-TOOLS-063 lists the contents exhaustively, so the build carries a revision of `PD-CONFIG-014` that extends REQ-TOOLS-063 and REQ-TOOLS-056 with this case, and the back-pointers.
- Left open, and settled below:
  - where the value it holds comes from;
  - what the change block says when the key is unstated;
  - what Approve for this session means for a request no answer pre-approves.

## 2. Journeys that cross it

- **When an agent asks to change a setting that governs later runs, I want to see what it holds now and what it will hold, so that I approve a change rather than a string.**
  - Entry: the dialog opens over the Workspace (`REQ-TOOLS-063`).
  - Steps: read the change block, then the detail box.
  - Exit: one of the three answers.
  - Trust point: the "now" value is read from the saved files at the moment of asking, not from the agent's arguments.
  - Recover: Deny, then ask the agent again; the setting is unchanged.
- **The several-agents journey:** requests queue one at a time (`REQ-TOOLS-063`). The block belongs to the request on screen and names its scope, so two queued changes to one setting read apart.
- Ruled out: every journey of a request that is not a `configure` set.

## 3. Content model and hierarchy

- **Change block:** one region, three lines, setting / now / after. The primary is the "after" value.
  - "Now" carries the scope that states it: the workspace file, the global file, or nothing.
  - The block is filled from a new payload field, `change` (§10 item 1).
  - It is absent whenever the field is.
- Detail box, fine print and buttons: unchanged. The detail box still shows the call's own arguments, so what the agent sent stays checkable against the block.
- The longest value: a list or mapping value is shown as its compact JSON, clipped at 240 characters with `…` as `REQ-TOOLS-057` clips; the clip applies to each of the two values on its own.

## 4. States

| Region | ideal | empty: first use | empty: cleared | empty: no results | filtered | cannot-show | loading | streaming / partial | error | success | disabled | permission-needed |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| change block | three lines, setting · now · after | the setting stated nowhere: "Now: not set (the built-in default applies)" | n/a — the dialog closes on answer | n/a — one request | n/a | the saved files would not load: the block is absent and the reason line says why (`approval.change` absent) | n/a — read before the dialog is posted | n/a | n/a — a read that fails leaves the block absent, as cannot-show | n/a — the dialog closes | the three buttons disabled by `REQ-TOOLS-063`'s undeliverable state; the block stays | n/a — the dialog is the permission |

## 5. Interaction

- The block takes no focus and has no control. Tab order is unchanged: Deny first (`REQ-TOOLS-063`), then the detail box, then the other two buttons.
- **Approve for this session** on a `configure` set answers as Approve once and grants nothing further (`PD-CONFIG-014` clause 4). The block's foot says so (§6), so the button keeps the meaning a user can read. `REQ-TOOLS-063`'s three buttons stand.
- No palette entry: the dialog is modal.

## 6. Copy

| Where | String |
|---|---|
| block heading (visually a caption) | `Change to the configuration` |
| line 1 | `Setting` · `<setting>` (mono) |
| line 2 | `Now` · `<value>` · `— <scope> file` (scope `workspace` or `global`); unstated: `not set (the built-in default applies)` |
| line 3 | `After` · `<value>` · `— <scope> file` |
| foot | `Applies from the next run. Each change to this setting asks again.` |

Bound: each value clipped at 240 characters with `…` (`REQ-TOOLS-057`); the setting is at most 200 (`CONFIG_KEY_PATH_MAX`).

## 7. Accessibility obligations

- `REQ-SHELL-149`: "now" and "after" are words, never colour alone.
- The block is part of the dialog's description. `aria-describedby` names the block and the detail box, block first, so a screen reader hears the change before the raw arguments.
- `REQ-SHELL-144`: the 240-character clip leaves the full value in the detail box, reachable by keyboard (it is focusable).

## 8. Composition intent

- Density: compact, as the dialog's other prose (mockup `WORKSPACE` → `approvalOn`).
- Earned surfaces: none new. The block is a ruled section on the dialog's own ground, not a card (the 2026-11-14 revision, `docs/design/README/08-8-the-2026-11-14-revision.md`).
- Each line is a label column and a value column. The label column is `--rt-space-*`-gapped, and values are in `mono` at `--rt-text-sm`.
- Relations: `approval-change` `containment` in the dialog; `approval-change-label` `equal-width` across the three lines; `text-fit` on the x axis for each value (it wraps, never scrolls).

| Region | 1400×900 | above 1180 | 1180–1080 | below 1080 | 1000×680 |
|---|---|---|---|---|---|
| change block | three lines above the detail box | same | same | same | same; at the 560×380 minimum the dialog body scrolls, the buttons stay in view |

## 9. Components

- Plain text in the dialog's existing classes: `dialog-body`, `text-secondary`, `mono`.
- No new control, and no §4.2 gap.

## 10. Disagreements and gaps

1. **The payload has no field for the change.**
   - Claim: the block needs the current value, read at the moment of asking.
   - It meets: `REQ-TOOLS-056`'s field list and the gate rule "the gate decides; the executor never asks" (`04-seams/04-4-a-tool.md`).
   - Settled: the executor may describe a call for approval without asking. An optional `describeForApproval(args)` on the executor returns the change, and the gate attaches it to the payload as `change` before posting. Built under `PD-CONFIG-014` revision 3, which extends `REQ-TOOLS-056` and `REQ-TOOLS-063`.
2. **Approve for this session grants nothing on a `configure` set.**
   - It meets: `REQ-TOOLS-063`'s three buttons.
   - Settled for this brief by the foot line, keeping all three buttons. Whether the button should instead be removed on such a request is raised as an open question, not ruled here.

## 11. Evidence plan

- Capture: `pnpm app:drive`, the scripted dialect, `ROTARIS_SCRIPT=configure:runtime.permission_mode="restricted"` under `autonomous`.
  - Steps: `waitFor "#approval-title" --window=approval`, then `shot --window=approval` at 1400×900 and at the 560×380 minimum.
  - A second run with an unstated setting (`configure:runtime.sandbox_mode="read-only"` in a file without it) for the empty-first-use cell.
- Rubric rows: F2, F3, F4, C1, D2.
- **Must move:**
  - The dialog of a `configure` set shows three change lines.
  - The "now" value equals the file's before the answer.
- **Must hold:**
  - Every other dialog is unchanged (`approvals-proof`).
  - Initial focus is on Deny (`approvals-proof`).
  - The three buttons stand (`approvals-proof`).
