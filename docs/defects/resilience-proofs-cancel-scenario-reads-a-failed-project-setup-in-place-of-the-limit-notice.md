## `resilience-proof`'s `cancel` scenario reads a failed project setup in place of the provider-limit notice

`apps/desktop/scripts/resilience-proof.mjs`'s `cancel` scenario asserts REQ-NOTIFY-063's notice ("provider limit was
reached … session is preserved … Open Models settings") by probing `.notice-slot` 1.2 s after the cancelled run's result.
Its workspaces carry `code_intelligence: { enabled: false }` and nothing else about initialization, so the open still
starts the code-intelligence project setup in the background (REQ-WORKSPACE-090 makes the task applicable whatever
`enabled` says), and in a checkout without the bundled runtime that setup fails. When its notice reaches the one slot
first, the probe reads it and the scenario fails on a notice it does not own. This is the shape
[`chat-controls-proof-reads-a-failed-project-setup-as-the-compress-passs-notice.md`](fixed/chat-controls-proof-reads-a-failed-project-setup-as-the-compress-passs-notice.md)
repaired for `chat-controls-proof` and `notice-proof` with the `initialization:` section of
`apps/desktop/scripts/lib/initialization-marker.mjs` (`SETUP_ANSWERED`) and the `backgroundSetupStarted` guard;
`resilience-proof` has neither.

Seen 2026-10-01 on branch `fin1-stall-and-intent-status` (head e5ebf9f, after `pnpm symbols && pnpm build`, as root under
Xvfb, no bundle in the worktree): one run of `pnpm resilience-proof --skip-build` failed `cancel` with
`REQ-NOTIFY-063's notice was not raised: {"text":"×Project setup did not finishDetailsCode intelligence setup did not complete for this project. It runs again the next time this workspace is opened.CopyDismiss",…}`;
the run before it (head 4868b8c) and the run after it, on the same build with nothing else of this worktree running,
passed all eleven scenarios. Intermittent: it depends on which notice reaches the slot first. Noticed while running the
proof for the repair of `a-provider-wait-or-a-compression-is-counted-as-a-stall.md`; recorded, not repaired.

## Specs

None contradicted by the product: the setup's notice is the product doing what it should (REQ-WORKSPACE-093,
REQ-NOTIFY-024's one slot). The proof reads a notice it does not own.

## Relevant files

- `apps/desktop/scripts/resilience-proof.mjs` — `scenario()`, which writes the workspace's `agents.yaml` without the
  `initialization:` section; the `cancel` scenario's `.notice-slot` probe and its assertion.
- `apps/desktop/scripts/lib/initialization-marker.mjs` — `SETUP_ANSWERED` and `backgroundSetupStarted`, the repair the two
  other proofs took.
- `apps/desktop/src/main/initialization.ts` — `CODE_INTELLIGENCE_FAILED_SUMMARY`, the notice's detail.
