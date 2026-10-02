## `chat-controls-proof` reads a failed project setup as the compress pass's notice

`apps/desktop/scripts/chat-controls-proof.mjs`'s first scenario (`compress-two`) asserts "no persistent notice on a
complete pass" by reading whatever notice the window shows 50 ms after the compress pass (line 199). The product also
shows a notice when project setup fails in the background, and in a checkout without the bundled code-intelligence
runtime (`apps/desktop/resources/code-intelligence/`, git-ignored, built once per checkout by `pnpm code-intel:bundle`)
it always does: the setup's `create` exits 127 ("the bundled code-intelligence runtime is not present in this
installation"), and "Project setup did not finish — Code intelligence setup did not complete for this project" is on
screen when the proof reads. The proof then fails at its first scenario with a message about compression, and none of
its own subjects — the compress pass's outcome, the transcript clear, the prompt-file commands — is reached.

Measured 2026-09-29 on the built app of branch `fix-transcript-append-2`
(`xvfb-run -a -s "-screen 0 1600x1000x24" node apps/desktop/scripts/chat-controls-proof.mjs --skip-build`, as root, no
bundle in the tree): exit 1 at line 199 with
`{"title":"Project setup did not finish",…,"detail":"Code intelligence setup did not complete for this project. It runs again the next time this workspace is opened.","severity":"error"}`;
the app log shows `mcp setup: create failed — exited with code 127`. The notice is the product doing what it should.

Noticed while running the proofs whose surfaces REQ-CHAT-055's CPU-profile round touched; recorded, not repaired.

## Specs

None contradicted by the product. The proof's assertion reads a notice it does not own: either the proof states and
checks its precondition (the bundle, or a project setup it controls), or it reads only the compress pass's notice.

## Relevant files

- `apps/desktop/scripts/chat-controls-proof.mjs` — line 199, the assertion; `readNotice`, the read it makes.
- `apps/desktop/src/main/initialization.ts` — `CODE_INTELLIGENCE_FAILED_SUMMARY`, the notice's detail.
- `apps/desktop/scripts/code-intelligence/bundle.mjs` — `pnpm code-intel:bundle`, the step the checkout lacked.

## Outcome

Repaired 2026-09-29 under R-067 (acceptance round 1, finding A50), on branch `fix-accept1-1`. The proof now states and
checks its precondition instead of reading a notice it does not own.

- **What changed.** Every scenario's workspace `agents.yaml` carries the `initialization:` section of a workspace that has
  answered its one registered task — `code-intelligence-setup` skipped, `last_run` stamped — from the new
  `apps/desktop/scripts/lib/initialization-marker.mjs` (`SETUP_ANSWERED`), the same product state `code-intel-proof` and
  `retrospective-proof` already wrote by hand. A skipped task is not pending, so the open starts no background setup
  (REQ-WORKSPACE-081, REQ-WORKSPACE-083, REQ-WORKSPACE-111), and no "Project setup did not finish" can take the one slot
  (REQ-NOTIFY-024). `code_intelligence: { enabled: false }` alone could not do this: REQ-WORKSPACE-090 makes the task
  applicable whenever the entry is configured and launchable, whatever its `enabled` says. Each launch then fails, by
  name, if its log shows `initialization: running code-intelligence-setup` anyway (`backgroundSetupStarted`), before any
  notice is read. The product is unchanged.
- **Pinned by** `apps/desktop/scripts/lib/initialization-marker.test.ts` (6 cases): the product's own
  `readInitializationState` and `deriveSets` read the section as leaving the task neither pending nor background, and read
  the same file without it as starting the task in the background; the task id is the one `src/main/initialization.ts`
  registers; the guard recognises the coordinator's start line and nothing else; and `chat-controls-proof.mjs` writes the
  section in `scenario()` and throws on the guard in `launch()` — those last two fail on the proof as it stood.
- **Shown by the proof,** as root under Xvfb, Node 24, after one `pnpm build`, in a worktree without the bundled runtime
  (`apps/desktop/resources/` held only `setup-manifest.json`): before the change, exit 1 at line 201 with
  `{"title":"Project setup did not finish",…}`, as measured above; after it, `chat-controls-proof PASSED`, all four
  launches, with no `initialization: running` line in any launch log (compress-two's: `0 pending (0 needing consent), 1
  runnable`). With the section taken out again and the guard kept, the proof stopped at compress-two with
  `the workspace's initialization started code-intelligence-setup in the background, …` rather than a message about
  compression.
- **Not shown:** the proof with the bundle built (not built in this worktree; the section makes the proof independent of
  it), and anything on Windows.
- **The same shape elsewhere,** recorded, not repaired here: `notice-proof`'s `review-action` scenario reads the setup
  failure's notice in place of "Workspace hooks need review" in the same checkout
  ([note](notice-proof-reads-a-failed-project-setup-in-place-of-the-hook-review-notice.md); repaired 2026-10-01 the same way, in `fixed/`). `slash-proof` and
  `library-proof`, the other two proofs that read the notice slot without the section, passed in the same checkout.
