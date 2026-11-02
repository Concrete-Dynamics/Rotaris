## `resilience-proof`'s `cancel` scenario reads a failed project setup in place of the provider-limit notice

`apps/desktop/scripts/resilience-proof.mjs`'s `cancel` scenario asserts REQ-NOTIFY-063's notice ("provider limit was
reached … session is preserved … Open Models settings") by probing `.notice-slot` 1.2 s after the cancelled run's result.
Its workspaces carry `code_intelligence: { enabled: false }` and nothing else about initialization, so the open still
starts the code-intelligence project setup in the background (REQ-WORKSPACE-090 makes the task applicable whatever
`enabled` says), and in a checkout without the bundled runtime that setup fails. When its notice reaches the one slot
first, the probe reads it and the scenario fails on a notice it does not own. This is the shape
[`chat-controls-proof-reads-a-failed-project-setup-as-the-compress-passs-notice.md`](chat-controls-proof-reads-a-failed-project-setup-as-the-compress-passs-notice.md)
repaired for `chat-controls-proof` and `notice-proof` with the `initialization:` section of
`apps/desktop/scripts/lib/initialization-marker.mjs` (`SETUP_ANSWERED`) and the `backgroundSetupStarted` guard;
`resilience-proof` has neither.

Seen 2026-10-01 on branch `fin1-stall-and-intent-status` (head e5ebf9f, after `pnpm symbols && pnpm build`, as root under
Xvfb, no bundle in the worktree): one run of `pnpm resilience-proof --skip-build` failed `cancel` with
`REQ-NOTIFY-063's notice was not raised: {"text":"×Project setup did not finishDetailsCode intelligence setup did not complete for this project. It runs again the next time this workspace is opened.CopyDismiss",…}`;
the run before it (head 4868b8c) and the run after it, on the same build with nothing else of this worktree running,
passed all eleven scenarios. Intermittent: it depends on which notice reaches the slot first. Noticed while running the
proof for the repair of `a-provider-wait-or-a-compression-is-counted-as-a-stall.md`; recorded, not repaired.

The `fatal` scenario reads the same slot and is exposed the other way: it asserts only that the notice it found is *not*
a provider limit, so a setup notice satisfies it. On 2026-10-01 (head of this branch after the verifier's round 1,
`pnpm symbols && pnpm build`, one run of `pnpm resilience-proof --skip-build` with another plan's live run and app on
the host) all eleven scenarios passed while `results.json`'s `fatal.notice` read "Project setup did not finish … Code
intelligence setup did not complete for this project …": the 401's own notice was not what the scenario saw, and it
passed without showing it.

## Specs

None contradicted by the product: the setup's notice is the product doing what it should (REQ-WORKSPACE-093,
REQ-NOTIFY-024's one slot). The proof reads a notice it does not own.

## Relevant files

- `apps/desktop/scripts/resilience-proof.mjs` — `scenario()`, which writes the workspace's `agents.yaml` without the
  `initialization:` section; the `cancel` scenario's `.notice-slot` probe and its assertion.
- `apps/desktop/scripts/lib/initialization-marker.mjs` — `SETUP_ANSWERED` and `backgroundSetupStarted`, the repair the two
  other proofs took.
- `apps/desktop/src/main/initialization.ts` — `CODE_INTELLIGENCE_FAILED_SUMMARY`, the notice's detail.

## Outcome — repaired 2026-10-01 (branch `fin4-proof-evidence`)

Confirmed first on the branch's base (origin/main 29314c0, `pnpm build`, one `pnpm resilience-proof --skip-build` under
Xvfb, no code-intelligence bundle in the worktree): every launch logged `initialization: running code-intelligence-setup
… (background)`; `cancel` failed (its confirmation dialog never matched after the setup's failure landed beside the
first click, so the 60 s wait ran out and the run completed), and `fatal` **passed** with `results.json`'s
`fatal.notice` reading "×Project setup did not finish … Code intelligence setup did not complete for this project …".

- `scenario()` writes `SETUP_ANSWERED` (`lib/initialization-marker.mjs`) into every workspace's `agents.yaml`, so the
  one registered task is answered (`skipped`) and never starts in the background (REQ-WORKSPACE-081/083/111).
- Every launch is guarded: `launch()` throws, and `drivenOverride()` reports a problem, when the log shows
  `backgroundSetupStarted` — the precondition checked rather than assumed.
- `fatal` asserts its notice **positively**: the run's `result` event carries the 401 (`HTTP 401`), and the notice in the
  slot carries that failure text as its detail and is dismissable (REQ-NOTIFY-064/065), beside the old "not a provider
  limit". `results.json` now records `fatal.error` and `fatal.notice`. The triage's sketch asked for "the 401's
  provider-auth wording and the Models settings action": the product has neither — REQ-NOTIFY-060's authentication class
  and its recovery (REQ-NOTIFY-067..079) are not built, and the generic notice lacks REQ-NOTIFY-064's wording and action.
  That is recorded as its own note,
  [`a-401-ends-the-run-with-a-bare-failure-notice-and-no-authentication-recovery.md`](a-401-ends-the-run-with-a-bare-failure-notice-and-no-authentication-recovery.md),
  and the scenario asserts what a 401's notice is today, not that recovery.
- Pinned in `apps/desktop/scripts/lib/initialization-marker.test.ts`: `resilience-proof` joins `SLOT_READERS` (the section
  in `scenario()`, the guard in `launch()`), and a case of its own holds the driven launch's guard. Without the repair
  the three cases fail; with it the file's eleven pass. A later case (repair round 1) holds `fatal`'s positive
  assertion — the result's `HTTP 401` and the slot's notice carrying that failure text with Dismiss — so it cannot
  quietly fall back to "not a limit": it fails on that weaker form, and the file's twelve pass.
- Shown: after the repair, `pnpm resilience-proof --skip-build` passed all eleven scenarios on each of three runs in the
  same bundle-less worktree, no launch log holding `initialization: running`, `cancel.notice` REQ-NOTIFY-063's ("The
  provider limit was reached; the session is preserved … Open Models settings") and `fatal.notice` the 401's ("The run
  failed: scripted authentication failure (HTTP 401) — HTTP 401 — Incorrect API key provided …").
