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
scenarios. [`chat-controls-proof-reads-a-failed-project-setup-as-the-compress-passs-notice.md`](chat-controls-proof-reads-a-failed-project-setup-as-the-compress-passs-notice.md)
is a neighbour: a proof that meets the same failed setup and misreads it (repaired since, in `fixed/`).

## Outcome — repaired 2026-10-01 (fin2, branch `fin2-proof-setup-precondition`)

**Confirmed first** on a fresh worktree cut from `origin/main` `d8ee835`, no bundle in the tree, after one `pnpm build`
(as root under Xvfb, Node 24, `--skip-build`): exit 1 with `the background task recorded nothing:` and the untouched
workspace file, while `background.log` held `initialization: code-intelligence-setup → failure — … exited with code 127`
and `rotaris: the bundled code-intelligence runtime is not present in this installation (build it with pnpm
code-intel:bundle)`.

**Repaired in the proof, not the product** (the product was right). The new
`apps/desktop/scripts/lib/code-intelligence-bundle.mjs` states the precondition: `ensureBundle` runs `bundle.mjs --check`
before the first launch; when the tree is absent or stale it builds it (`bundle.mjs`, then `--check` again) when the
proof builds, and with `--skip-build` it refuses at once, naming `pnpm code-intel:bundle`, before any scenario. Every
`init-proof` check that expects `code-intelligence-setup` recorded (scenario 1's "recorded nothing" and "not recorded
completed", 3's background task beside the consent prompt, 4's "task after the failure", 5's card state) now goes
through `withSetupFailure`, which quotes the app log's own failure lines (`setupFailureOf`) after the proof's message, so
a setup that fails for another reason with the bundle present names its cause too.

**Pinned by** `apps/desktop/scripts/lib/code-intelligence-bundle.test.ts` (10 cases): `ensureBundle`'s four paths
(present, `--skip-build` refusal building nothing, built then re-checked, a failed or still-stale build refused),
`setupFailureOf` on the lines the built app logged, and two cases on `init-proof.mjs`'s own text (the bundle is ensured
before the first launch; every "not recorded" check quotes the failure) — those two red on the proof's old form.

**Shown** in the same worktree: `init-proof --skip-build` with no bundle stopped before any launch with "the bundled
code-intelligence runtime is absent or stale, and --skip-build builds nothing: run pnpm code-intel:bundle first. …";
`init-proof` without `--skip-build` built the app and the bundle (`the code-intelligence bundle is built`, from the
network, no cache) and passed all five scenarios; `init-proof --skip-build` then read `the code-intelligence bundle is
present` and passed all five again.

## Specs

None broken by the product, which logs the missing runtime and raises the notice "Project setup did not finish". The
proof's message sends the reader to the wrong place, the workspace file's writer, when the cause is the build tree.

## Relevant files

- `apps/desktop/scripts/init-proof.mjs`: scenario 1's `the background task recorded nothing` check, and the build step
  before it.
- `apps/desktop/scripts/code-intelligence/bundle.mjs`: `--check`, which answers whether the tree is present and current.
- `apps/desktop/scripts/lib/code-intelligence-bundle.mjs` (the repair): `ensureBundle`, `setupFailureOf`, `withSetupFailure`;
  `code-intelligence-bundle.test.ts` beside it.

Noticed 2026-09-30 while running the proofs of the Settings category press repair under R-067.
