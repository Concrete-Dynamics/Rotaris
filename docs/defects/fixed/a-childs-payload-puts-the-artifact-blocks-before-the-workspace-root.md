## A child's payload puts the artifact blocks before the workspace root

`REQ-TOOLS-154` fixes the child's payload in an observable order: (1) the workspace-root prefix, (2) the
verifier-evidence prefix for the acceptance persona, (3) the baseline sibling-artifact index, (4) the full bodies
of attached artifacts, (5) the inherited-context block, (6) the caller's `task` text, with REQ-ORCH-047's
prior-agent-context block ahead of (1). `childPayload` (`packages/engine/src/children/notify.ts`) emits the
prior-agent context, then the artifact blocks (3) and (4), then the workspace root (1), then the task. Its own
comment says the artifact blocks "sit after the dependency reports and before the workspace root", so the order
was chosen and does not match the requirement.

Noticed 2026-09-23 while placing PD-TOOLS-006's write-scope block, which the directive puts "immediately after
the workspace-root prefix". The new block follows the workspace-root line wherever that line stands, so repairing
this order later moves both together. Not repaired here, because it is outside what R-049 ruled.

## Specs

- `REQ-TOOLS-154`: the workspace-root prefix is item (1), ahead of the sibling-artifact index (3) and the attached
  artifacts (4). The code puts it after both.

## Relevant files

- `packages/engine/src/children/notify.ts`: `childPayload`, the assembly order and the comment choosing it.
- `packages/engine/src/children/orchestration.ts`: `execute`, the one caller, passing the artifact blocks.

## Repaired 2026-09-27 ([R-054](../../product/requests.md#r-054))

`childPayload` now emits REQ-ORCH-047's prior-agent context, then (1) the workspace root with PD-TOOLS-006's
write-scope block immediately after it, then (3) the sibling-artifact index and (4) the attached artifacts, then
(6) the task. The write-scope block moved with the workspace-root line, as the note foresaw. The comment that
chose the old order is replaced by one that states REQ-TOOLS-154's.

Items (2) and (5) still have no block. The verification suite that fills (2) is not built. Item (5) was found
missing while making this repair and is its own note:
[`the-inherited-context-reports-never-reach-the-child.md`](../the-inherited-context-reports-never-reach-the-child.md).

Evidence: `packages/engine/src/children/notify.test.ts` asserts the positions of all six present blocks in
order, and that a child with no dependencies starts at the workspace root. With the old `childPayload`
restored, both tests fail. `children.test.ts`'s PD-TOOLS-006 cases, which pin the write scopes directly after the
workspace-root line, still pass.
