## `init-proof` reads a missing code-intelligence bundle as a background task that recorded nothing

`init-proof`'s first scenario checks that the default background task (`code-intelligence-setup`) recorded its outcome.
That task runs the bundled code-intelligence runtime (`apps/desktop/resources/code-intelligence/`), which git ignores.
Only `pnpm code-intel:bundle` builds it, and a fresh worktree does not have it. With no bundle, the setup's `create`
step exits 127 and the task records a failure. The app says why in its own log: "the bundled code-intelligence runtime
is not present in this installation (build it with pnpm code-intel:bundle)". The proof then fails with "the background
task recorded nothing", which names neither the bundle nor the failure. It builds the app when run without
`--skip-build`, but it never checks for the bundle or builds it.

Measured 2026-09-30 on a fresh worktree (`fix-accept1-4`), as root under Xvfb, Node 24, `--skip-build`. Two runs went red
in scenario 1 that way. After `pnpm code-intel:bundle` (about 10 s from its cache), the next run passed all five
scenarios. [`chat-controls-proof-reads-a-failed-project-setup-as-the-compress-passs-notice.md`](fixed/chat-controls-proof-reads-a-failed-project-setup-as-the-compress-passs-notice.md)
is a neighbour: a proof that meets the same failed setup and misreads it (repaired since, in `fixed/`).

## Specs

None broken by the product, which logs the missing runtime and raises the notice "Project setup did not finish". The
proof's message sends the reader to the wrong place, the workspace file's writer, when the cause is the build tree.

## Relevant files

- `apps/desktop/scripts/init-proof.mjs`: scenario 1's `the background task recorded nothing` check, and the build step
  before it.
- `apps/desktop/scripts/code-intelligence/bundle.mjs`: `--check`, which answers whether the tree is present and current.

Noticed 2026-09-30 while running the proofs of the Settings category press repair under R-067.
