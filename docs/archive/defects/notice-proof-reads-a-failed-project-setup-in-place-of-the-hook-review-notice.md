## `notice-proof` reads a failed project setup in place of the hook-review notice

`apps/desktop/scripts/notice-proof.mjs`'s `review-action` scenario expects "Workspace hooks need review" in the notice
slot at 2.5 s (line 277). Its scratch workspace carries no `initialization:` section, so every launch opens a
never-initialized workspace and `code-intelligence-setup` starts in the background (REQ-WORKSPACE-083) — `enabled: false`
on the `code_intelligence` entry does not make the task inapplicable (REQ-WORKSPACE-090). In a checkout without the
bundled code-intelligence runtime (`pnpm code-intel:bundle`, git-ignored) the setup's `create` exits 127 and
"Project setup did not finish" is published after the hooks notice, replacing it (REQ-NOTIFY-024). The proof then fails
with a message about REQ-NOTIFY-224, and none of its later subjects is reached.

Measured 2026-09-30 on the built app of branch `fix-accept1-1` (`xvfb-run -a -s "-screen 0 1600x1000x24" node
apps/desktop/scripts/notice-proof.mjs --skip-build`, as root, no bundle in the tree): exit 1 with
`the notice on screen: ["Project setup did not finish"] (REQ-NOTIFY-224)`; `review-action.log` shows notice #1
"Workspace hooks need review" at 11:39:17.933 and notice #2 "Project setup did not finish" at 11:39:18.748. The
`advisory` and `scoping` launches started the background setup too. The product is doing what it should.

Noticed while repairing the same shape in `chat-controls-proof`
([fixed](chat-controls-proof-reads-a-failed-project-setup-as-the-compress-passs-notice.md)); recorded, not repaired there.
That repair's `apps/desktop/scripts/lib/initialization-marker.mjs` (`SETUP_ANSWERED`, `backgroundSetupStarted`) is the
shape a repair here could reuse.

## Outcome — repaired 2026-10-01 (fin2, branch `fin2-proof-setup-precondition`)

**Confirmed first** on a fresh worktree cut from `origin/main` `d8ee835`, no bundle in the tree, after one `pnpm build`
(`xvfb-run -a -s "-screen 0 1600x1000x24" node apps/desktop/scripts/notice-proof.mjs --skip-build`, as root, Node 24):
exit 1 at line 277 with `the notice on screen: ["Project setup did not finish"] (REQ-NOTIFY-224)`; `review-action.log`
held notice #1 "Workspace hooks need review" at 10:06:37.291, the background `code-intelligence-setup` start a millisecond
later, and notice #2 "Project setup did not finish" at 10:06:37.567.

**Repaired in the proof, as `chat-controls-proof` was.** `scenario()` writes `SETUP_ANSWERED`
(`lib/initialization-marker.mjs`) into every scratch workspace's `agents.yaml`, so the one registered task is skipped —
neither pending nor background (REQ-WORKSPACE-081/111) — and no launch starts it (REQ-WORKSPACE-083). `launch()` fails
any launch whose log shows `backgroundSetupStarted` anyway, before a notice is read, naming the setup rather than the
proof's subject.

**Pinned by** `lib/initialization-marker.test.ts`, whose two cases on a proof's text now run for `notice-proof` beside
`chat-controls-proof` (8 cases; the two `notice-proof` ones red on its old form).

**Shown** in the same worktree with the bundle moved out of the tree: `notice-proof --skip-build` passed whole
(`PART V PROOF PASSED`, exit 0), `review-action.log` holding one notice, "Workspace hooks need review", and its
initialization line `0 pending (0 needing consent), 1 runnable`; no launch log of the proof shows a background setup.

## Specs

None contradicted by the product. The proof's assertion reads a notice it does not own: it should state and check its
precondition (an answered project setup, or the bundle).

## Relevant files

- `apps/desktop/scripts/notice-proof.mjs` — `scenario()`'s workspace `agents.yaml` (line 54), and the `review-action`
  assertion (line 277).
- `apps/desktop/scripts/lib/initialization-marker.mjs` — the answered section and the guard both proofs now use;
  `initialization-marker.test.ts` beside it.
- `apps/desktop/src/main/initialization.ts` — `CODE_INTELLIGENCE_FAILED_SUMMARY`, the replacing notice's detail.
