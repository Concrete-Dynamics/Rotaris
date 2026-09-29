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
