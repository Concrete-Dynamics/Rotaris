# Seams — what to touch, in what order, to add one of the things this product adds most often — 6. A notice or an acknowledgement

Part 6 of 8 of [the seams](../04-seams.md), which indexes every part.

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
- **A notice about a workspace's store is main's, raised from the open's answer** (`openWorkspaceInner`, since 2026-10-14):
  `workspace.opened`'s `cutRestore` becomes one info notice (OQ-266), and a refused store (`workspace.store-missing`,
  `workspace.store-displaced`) an error notice whose headline and detail are the workspace service's own words, held for the
  listing to answer with (REQ-SESSION-202). An identifier present but unreadable (`workspace.identifier-unreadable`, its
  words in `workspace-service/identifier-refusal.ts`), and a workspace path or `.rotaris` that is a file
  (`workspace.not-a-folder`, `workspace-service/not-a-folder.ts`, asked before the identifier is read), are held and raised
  the same way, once while held and with no action (REQ-SESSION-197; since 2026-10-31). A hold that replaces another for the
  same root withdraws the notice it held (`holdOpenRefusal`'s `dismiss`). Every word is decided in `main/store-notice.ts`
  (`cutRestoreNotice`, `storeRefusalOf`, `workspaceRefusalOf`, `storeRefusalNotice`, `holdOpenRefusal`; pure, pinned by its
  test), which `openWorkspaceInner` only raises. A new condition of the open follows the same path: a refusal code in the
  workspace service, and a set in `main/store-notice.ts` — `STORE_REFUSALS` for the store's place, `WORKSPACE_REFUSALS` for
  the workspace itself.
- **A notice raised at two sites is built by one composer** (since 2026-10-14, OQ-293). The unreviewed-hooks notice
  (REQ-NOTIFY-224) is raised in the open slot of `openWorkspaceInner` and from a run's `notice.publish`; both go through
  `hooksReviewNotice(root, notice)` in `main/hooks-review-notice.ts` (the open slot by `hooksReviewOpenReport`, the run's by
  `runNoticeReport` in `main/run-notice.ts`), which names the project on PD-WORKSPACE-005's rule (`main/project-name.ts`,
  shared with the project-setup banners): title `{headline}: {name}`, the requirement's sentence as the message, the folder
  opening the detail. A notice the run host publishes is mapped to the store's input in `runNoticeReport` alone, and the
  action vocabulary main raises from in `recoveryFor` (`main/notice-recovery.ts`); an action naming a workspace takes the
  root on the event (`workspaceRoot`), never the focused window's, where the event carries one; a `hooks.review` notice that
  carries none is raised with the engine's words and no action (2026-10-14, fin45).
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
