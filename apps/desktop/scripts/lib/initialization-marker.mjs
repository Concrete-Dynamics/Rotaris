/**
 * The workspace `agents.yaml`'s `initialization:` section as a workspace that has already answered its one registered
 * task holds it (REQ-WORKSPACE-078/081/088/111), for a proof whose subject is not project setup.
 *
 * Without it every launch opens a never-initialized workspace, and `code-intelligence-setup` — applicable whenever the
 * `code_intelligence` entry is configured, whatever its `enabled` says (REQ-WORKSPACE-090, REQ-MCP-037) — starts by
 * itself in the background (REQ-WORKSPACE-083). In a checkout without the bundled code-intelligence runtime
 * (`pnpm code-intel:bundle`, git-ignored) its `create` exits 127 and the product publishes "Project setup did not finish"
 * (REQ-WORKSPACE-103). Exactly one notice is current (REQ-NOTIFY-024), so that notice then stands in the slot a proof
 * reads, and the proof reports it as a failure of its own subject
 * (`docs/defects/fixed/chat-controls-proof-reads-a-failed-project-setup-as-the-compress-passs-notice.md`).
 *
 * `skipped` rather than `completed`: nothing was set up, and a skipped task is not pending, so reopening never starts it
 * (REQ-WORKSPACE-081, last sentence). Nothing here is a test seam — it is the product's own persisted state.
 */
export const INITIALIZATION_TASK_ID = 'code-intelligence-setup';

/** The section's lines, to be joined into a scratch workspace `agents.yaml` at the top level. */
export const SETUP_ANSWERED = Object.freeze([
  'initialization:',
  `  completed: []`,
  `  skipped: [${INITIALIZATION_TASK_ID}]`,
  "  last_run: '2026-09-29T00:00:00.000Z'",
]);

/**
 * True when a launch's log shows the product starting the setup task in the background anyway — the precondition the
 * section above establishes did not hold, and the proof says so instead of misreading what follows.
 */
export function backgroundSetupStarted(log) {
  return new RegExp(`initialization: running ${INITIALIZATION_TASK_ID}\\b`).test(log);
}
