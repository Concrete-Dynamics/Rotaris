#!/usr/bin/env node
// @ts-check
// Path → area map for the local verification planner. Areas are AGENTS.md's
// proof-script groups: a match takes the **complete** suite, not the one script
// named after the file. An unmapped path is not "no proofs" — the planner
// requires explicit review (AGENTS.md, "run the whole suite a part touches").
//
// Longest matching `paths` entry wins. A proof-script filename still adds that
// one proof on top. `live-run` and `slice-proof` are listed so they cannot be
// forgotten, and the planner never schedules them automatically.

/**
 * @typedef {{
 *   title: string,
 *   proofs: string[],
 *   views: string[],
 *   neighbors?: string[],
 * }} Area
 */

/**
 * @typedef {{
 *   paths: string[],
 *   areas?: string[],
 *   proofs?: string[],
 *   views?: string[],
 *   review?: string,
 *   notes?: string[],
 * }} Rule
 */

/** @type {Readonly<Record<string, Area>>} */
export const AREAS = Object.freeze({
  run: {
    title: 'The run',
    proofs: [
      'part-h-proof', 'part-j-proof', 'continuation-proof', 'plan-gate-proof',
      'resilience-proof', 'compression-proof', 'checkpoint-proof', 'sessions-proof',
      'restore-kill-proof', 'store-resolution-proof',
    ],
    views: [
      'docs/architecture/views/03-runtime-view.md',
      'docs/architecture/views/05-state-ownership.md',
    ],
  },
  tools: {
    title: 'Tools',
    proofs: [
      'fetch-proof', 'edits-proof', 'questions-proof', 'approvals-proof', 'todo-proof',
      'attachments-proof', 'artifacts-proof', 'mcp-proof', 'code-intel-proof',
      'skills-proof', 'injection-proof', 'sandbox-proof', 'terminal-stream-proof',
      'tool-shapes-proof', 'delegation-proof',
    ],
    views: [
      'docs/architecture/views/04-seams.md',
      'docs/architecture/views/02-process-view.md',
    ],
  },
  configStartup: {
    title: 'Configuration and startup',
    proofs: [
      'config-proof', 'init-proof', 'workspace-proof', 'settings-proof',
      'updater-proof', 'exit-trace-proof',
    ],
    views: [
      'docs/architecture/views/06-sequences.md',
      'docs/architecture/views/04-seams.md',
    ],
  },
  transcript: {
    title: 'Transcript',
    proofs: ['transcript-proof', 'rows-proof', 'update-depth-proof'],
    views: ['docs/architecture/views/04-seams.md'],
  },
  composer: {
    title: 'Composer',
    proofs: ['composer-proof', 'slash-proof', 'chat-controls-proof'],
    views: ['docs/architecture/views/04-seams.md'],
  },
  palette: {
    title: 'Command palette',
    proofs: ['palette-proof'],
    views: ['docs/architecture/views/04-seams.md'],
  },
  notice: {
    title: 'Notices',
    proofs: ['notice-proof'],
    views: ['docs/architecture/views/04-seams.md'],
  },
  library: {
    title: 'Library',
    proofs: ['library-proof', 'artifacts-proof', 'improvements-proof', 'retrospective-proof'],
    views: ['docs/architecture/views/04-seams.md'],
  },
  mission: {
    title: 'Mission',
    proofs: ['mission-proof'],
    views: ['docs/architecture/views/04-seams.md'],
  },
  git: {
    title: 'Git view',
    proofs: ['git-proof'],
    views: ['docs/architecture/views/04-seams.md'],
  },
  terminal: {
    title: 'Terminal',
    proofs: ['terminal-proof', 'terminal-stream-proof'],
    views: ['docs/architecture/views/04-seams.md'],
  },
  themeLayout: {
    title: 'Theme and layout',
    proofs: ['theme-proof', 'layout-proof'],
    views: [
      'docs/architecture/views/04-seams.md',
      'docs/design/README.md',
    ],
  },
  overview: {
    title: 'Overview',
    proofs: ['overview-proof'],
    views: ['docs/architecture/views/04-seams.md'],
  },
  requirements: {
    title: 'Requirements',
    proofs: ['requirements-proof', 'requirements-runs-proof', 'traceability-proof'],
    views: ['docs/architecture/views/06-sequences.md'],
  },
  record: {
    title: 'The record itself',
    proofs: ['directive-proof'],
    views: [],
  },
  driver: {
    title: 'Driver seam',
    proofs: ['driver-proof'],
    views: [],
  },
  known: {
    title: 'Known, no proof suite',
    proofs: [],
    views: [],
  },
});

/** Never scheduled by the planner. AGENTS.md: live-run is never automatic. */
export const NEVER_AUTOMATIC = Object.freeze(['live-run', 'slice-proof']);

/**
 * Longest `paths` match wins. `review` means the path is classified and still
 * needs a person (or agent) to name the proofs — it is not unknown, and it is
 * not a licence to skip.
 *
 * @type {readonly Rule[]}
 */
export const RULES = Object.freeze([
  // --- composition roots: run-host ---
  { paths: ['apps/desktop/src/run-host/dispatch'], areas: ['run', 'tools'],
    review: 'run-host dispatch is a shared seam — both The run and Tools suites, and name anything else the kind reaches' },
  { paths: ['apps/desktop/src/run-host/loop', 'apps/desktop/src/run-host/host', 'apps/desktop/src/run-host/launch',
    'apps/desktop/src/run-host/intent', 'apps/desktop/src/run-host/session-actions', 'apps/desktop/src/run-host/session-roots'],
    areas: ['run'] },
  { paths: ['apps/desktop/src/run-host/tools', 'apps/desktop/src/run-host/mcp', 'apps/desktop/src/run-host/code-intelligence-launch',
    'apps/desktop/src/run-host/skills', 'apps/desktop/src/run-host/throw-on-abort'], areas: ['tools'] },
  { paths: ['apps/desktop/src/run-host/terminal'], areas: ['terminal', 'tools'] },
  { paths: ['apps/desktop/src/run-host/hooks'], areas: ['notice', 'configStartup'] },
  { paths: ['apps/desktop/src/run-host/configuration'], areas: ['configStartup'] },
  { paths: ['apps/desktop/src/run-host/checkpoints'], areas: ['run'] },
  { paths: ['apps/desktop/src/run-host/improvement-capture'], areas: ['library'] },
  { paths: ['apps/desktop/src/run-host/scripted-client'],
    review: 'the proofs\' stand-in client — name the suites whose scripted steps this changes' },
  { paths: ['apps/desktop/src/run-host/'], areas: ['run'] },

  // --- composition roots: main ---
  { paths: ['apps/desktop/src/main/driver', 'apps/desktop/scripts/drive.mjs'], areas: ['driver'] },
  { paths: ['apps/desktop/src/main/updater/'], areas: ['configStartup'] },
  { paths: ['apps/desktop/src/main/initialization'], areas: ['configStartup'] },
  { paths: ['apps/desktop/src/main/store-resolution', 'apps/desktop/src/main/store-notice'], areas: ['run'] },
  { paths: ['apps/desktop/src/main/notices', 'apps/desktop/src/main/notice-recovery', 'apps/desktop/src/main/config-fatal-notice',
    'apps/desktop/src/main/hooks-review-notice', 'apps/desktop/src/main/run-notice', 'apps/desktop/src/main/run-failure-notice',
    'apps/desktop/src/main/improvement-notice'], areas: ['notice'] },
  { paths: ['apps/desktop/src/main/auth-recovery', 'apps/desktop/src/main/auth-fallback', 'apps/desktop/src/main/failure-class'],
    areas: ['run'] },
  { paths: ['apps/desktop/src/main/close-confirmation', 'apps/desktop/src/main/exit', 'apps/desktop/src/main/main-windows',
    'apps/desktop/src/main/windows'], areas: ['configStartup', 'run'] },
  { paths: ['apps/desktop/src/main/terminal'], areas: ['terminal'] },
  { paths: ['apps/desktop/src/main/library', 'apps/desktop/src/main/improvements', 'apps/desktop/src/main/improvement-export'],
    areas: ['library'] },
  { paths: ['apps/desktop/src/main/requirements'], areas: ['requirements'] },
  { paths: ['apps/desktop/src/main/commands/'],
    views: ['docs/architecture/views/04-seams.md'],
    review: 'a renderer command (04-seams §1) — name the proofs the kind belongs to' },
  { paths: ['apps/desktop/src/main/index.ts'],
    review: 'main\'s runCommand table is a shared seam — name the proofs the handler reaches' },
  { paths: ['apps/desktop/src/main/'], areas: ['configStartup'] },

  // --- composition roots: renderer / preload ---
  { paths: ['apps/desktop/src/preload/'],
    views: ['docs/architecture/views/04-seams.md', 'docs/architecture/views/02-process-view.md'],
    review: 'the frozen bridge — a channel (04-seams §2) needs the process view updated in the same commit' },
  { paths: ['apps/desktop/src/renderer/windows.tsx'],
    review: 'every non-main window role — name the surface suites the role draws' },
  { paths: ['apps/desktop/src/renderer/main.tsx'], areas: ['themeLayout', 'overview', 'composer'] },
  { paths: ['apps/desktop/src/renderer/session-actions'], areas: ['run', 'composer'] },
  { paths: ['apps/desktop/src/renderer/session-view'], areas: ['transcript'] },
  { paths: ['apps/desktop/src/renderer/shell', 'apps/desktop/src/renderer/display-prefs', 'apps/desktop/src/renderer/design.css'],
    areas: ['themeLayout'] },
  { paths: ['apps/desktop/src/renderer/notice-'], areas: ['notice'] },
  { paths: ['apps/desktop/src/renderer/guard-question'], areas: ['configStartup'] },
  { paths: ['apps/desktop/src/renderer/'],
    review: 'renderer composition root — name the surface suites this file draws' },

  // --- composition roots: workspace-service ---
  { paths: ['apps/desktop/src/workspace-service/delivery', 'apps/desktop/src/workspace-service/traceability'],
    areas: ['requirements'] },
  { paths: ['apps/desktop/src/workspace-service/store-'], areas: ['run'] },
  { paths: ['apps/desktop/src/workspace-service/improvements', 'apps/desktop/src/workspace-service/prompts'],
    areas: ['library'] },
  { paths: ['apps/desktop/src/workspace-service/'], areas: ['configStartup'] },

  // --- engine ---
  { paths: ['packages/engine/src/artifacts/'], areas: ['library', 'tools'] },
  { paths: ['packages/engine/src/children/'], areas: ['run'] },
  { paths: ['packages/engine/src/improvements/'], areas: ['library'] },
  { paths: ['packages/engine/src/intent/'], areas: ['run'] },
  { paths: ['packages/engine/src/playbooks/'], areas: ['run'] },
  { paths: ['packages/engine/src/run/todo'], areas: ['run'], proofs: ['todo-proof'] },
  { paths: ['packages/engine/src/run/chat-controls'], areas: ['run'], proofs: ['chat-controls-proof'] },
  { paths: ['packages/engine/src/run/'], areas: ['run'] },
  { paths: ['packages/engine/src/attachments'], areas: ['tools'] },
  { paths: ['packages/engine/src/todo-view'], areas: ['tools'], proofs: ['todo-proof'] },
  { paths: ['packages/engine/src/sessions', 'packages/engine/src/session-', 'packages/engine/src/projection-'],
    areas: ['run'] },
  { paths: ['packages/engine/src/checkpoint-port'], areas: ['run'] },
  { paths: ['packages/engine/src/autopsy'], areas: ['known'],
    notes: ['autopsy is the live-run reader; a change here is not a product proof'] },
  { paths: ['packages/engine/'], areas: ['run'] },

  // --- tools / mcp / hooks / model ---
  { paths: ['packages/agent-tools/src/terminal/'], areas: ['terminal', 'tools'] },
  { paths: ['packages/agent-tools/src/confinement/'], areas: ['tools'] },
  { paths: ['packages/agent-tools/'], areas: ['tools'] },
  { paths: ['packages/mcp/'], areas: ['tools'] },
  { paths: ['packages/hooks/'], areas: ['notice', 'configStartup'] },
  { paths: ['packages/model/'], areas: ['run'] },

  // --- config / platform / shell / providers ---
  { paths: ['packages/config/src/skills/'], areas: ['tools'] },
  { paths: ['packages/config/src/init/'], areas: ['configStartup'] },
  { paths: ['packages/config/src/instructions'], areas: ['tools'] },
  { paths: ['packages/config/'], areas: ['configStartup'] },
  { paths: ['packages/platform/'], areas: ['configStartup'] },
  { paths: ['packages/shell/'], areas: ['configStartup'] },
  { paths: ['packages/providers/'], areas: ['run', 'configStartup'] },

  // --- store / workspace ---
  { paths: ['packages/store/src/schema.ts'], areas: ['run'],
    views: ['docs/architecture/views/04-seams.md'],
    review: 'a store table or column (04-seams §3) — update the view in the same commit' },
  { paths: ['packages/store/'], areas: ['run'] },
  { paths: ['packages/workspace/src/git/'], areas: ['git', 'run'] },
  { paths: ['packages/workspace/src/traceability/', 'packages/workspace/src/delivery/'], areas: ['requirements'] },
  { paths: ['packages/workspace/src/improvements/'], areas: ['library'] },
  { paths: ['packages/workspace/src/restore'], areas: ['run'] },
  { paths: ['packages/workspace/'], areas: ['configStartup'] },

  // --- contracts (shared seam; most files still name an area) ---
  { paths: ['packages/contracts/src/commands'],
    views: ['docs/architecture/views/04-seams.md'],
    review: 'a renderer command (04-seams §1) — name the proofs the kind belongs to' },
  { paths: ['packages/contracts/src/channels'],
    views: ['docs/architecture/views/04-seams.md', 'docs/architecture/views/02-process-view.md'],
    review: 'a main → renderer channel (04-seams §2)' },
  { paths: ['packages/contracts/src/process-protocol'],
    views: ['docs/architecture/views/02-process-view.md'],
    review: 'what crosses a process boundary' },
  { paths: ['packages/contracts/src/tools'], areas: ['tools'] },
  { paths: ['packages/contracts/src/notices'], areas: ['notice'] },
  { paths: ['packages/contracts/src/config'], areas: ['configStartup'] },
  { paths: ['packages/contracts/src/control', 'packages/contracts/src/children', 'packages/contracts/src/checkpoints',
    'packages/contracts/src/intent', 'packages/contracts/src/status'], areas: ['run'] },
  { paths: ['packages/contracts/src/git'], areas: ['git'] },
  { paths: ['packages/contracts/src/requirements'], areas: ['requirements'] },
  { paths: ['packages/contracts/src/library', 'packages/contracts/src/artifacts', 'packages/contracts/src/improvements'],
    areas: ['library'] },
  { paths: ['packages/contracts/src/mcp', 'packages/contracts/src/skills', 'packages/contracts/src/confinement'],
    areas: ['tools'] },
  { paths: ['packages/contracts/src/terminal'], areas: ['terminal'] },
  { paths: ['packages/contracts/src/hooks'], areas: ['notice'] },
  { paths: ['packages/contracts/src/providers', 'packages/contracts/src/auth-recovery', 'packages/contracts/src/reauth'],
    areas: ['run'] },
  { paths: ['packages/contracts/src/initialization'], areas: ['configStartup'] },
  { paths: ['packages/contracts/src/slash'], areas: ['composer'] },
  { paths: ['packages/contracts/src/theme/'], areas: ['themeLayout'] },
  { paths: ['packages/contracts/src/index.ts'],
    review: 'the contracts barrel is a shared seam — name the proofs the exported type belongs to' },
  { paths: ['packages/contracts/'],
    review: 'contracts is a shared seam — name the proofs the types belong to' },

  // --- kernel ---
  { paths: ['packages/kernel/'], areas: ['known'] },

  // --- ui / ui-core ---
  { paths: ['packages/ui/src/design-system/'], areas: ['themeLayout'],
    review: 'shared visual language — name the surface proofs the tokens reach' },
  { paths: ['packages/ui/src/transcript/'], areas: ['transcript'] },
  { paths: ['packages/ui/src/RowProof', 'packages/ui/src/rows.test'], areas: ['transcript'] },
  { paths: ['packages/ui/src/composer', 'packages/ui/src/RunHeader'], areas: ['composer'] },
  { paths: ['packages/ui/src/slash/'], areas: ['composer'] },
  { paths: ['packages/ui/src/commands/'], areas: ['palette'] },
  { paths: ['packages/ui/src/Notice', 'packages/ui/src/Acknowledgements', 'packages/ui/src/acknowledgements'],
    areas: ['notice'] },
  { paths: ['packages/ui/src/library/'], areas: ['library'] },
  { paths: ['packages/ui/src/ImprovementActivity', 'packages/ui/src/improvement-activity', 'packages/ui/src/ArtifactLinks'],
    areas: ['library'] },
  { paths: ['packages/ui/src/markdown/'], areas: ['library', 'transcript'] },
  { paths: ['packages/ui/src/MissionView', 'packages/ui/src/AgentTree', 'packages/ui/src/AgentTable',
    'packages/ui/src/Inspector', 'packages/ui/src/PersonaWindow', 'packages/ui/src/TimeoutLine',
    'packages/ui/src/agents', 'packages/ui/src/agent-', 'packages/ui/src/cancel-'], areas: ['mission'] },
  { paths: ['packages/ui/src/GitView', 'packages/ui/src/WorktreeDialog'], areas: ['git'] },
  { paths: ['packages/ui/src/StatusStripItem'], areas: ['git', 'themeLayout'] },
  { paths: ['packages/ui/src/terminal/'], areas: ['terminal'] },
  { paths: ['packages/ui/src/theme', 'packages/ui/src/fonts.css', 'packages/ui/src/shell.css', 'packages/ui/src/motion'],
    areas: ['themeLayout'] },
  { paths: ['packages/ui/src/AppShell', 'packages/ui/src/NavRail', 'packages/ui/src/WorkspaceView',
    'packages/ui/src/layout-regression', 'packages/ui/src/label-measure'], areas: ['themeLayout'] },
  { paths: ['packages/ui/src/OverviewView'], areas: ['overview'] },
  { paths: ['packages/ui/src/SettingsView', 'packages/ui/src/settings/'], areas: ['configStartup'] },
  { paths: ['packages/ui/src/PlanGate', 'packages/ui/src/plan-gate'], areas: ['run'] },
  { paths: ['packages/ui/src/ApprovalDialog'], areas: ['tools'] },
  { paths: ['packages/ui/src/QuestionStepper', 'packages/ui/src/questions'], areas: ['tools'] },
  { paths: ['packages/ui/src/TodoPane', 'packages/ui/src/todo.test'], areas: ['tools'] },
  { paths: ['packages/ui/src/SessionBrowser'], areas: ['run'] },
  { paths: ['packages/ui/src/PauseDialog'], areas: ['run'] },
  { paths: ['packages/ui/src/CheckpointDialogs', 'packages/ui/src/checkpoint-dialogs-css'], areas: ['run'] },
  { paths: ['packages/ui/src/AuthRecoveryDialog', 'packages/ui/src/auth-recovery', 'packages/ui/src/ReauthPrompt',
    'packages/ui/src/reauth-prompt'], areas: ['run'] },
  { paths: ['packages/ui/src/ProjectSetupDialog', 'packages/ui/src/project-setup-', 'packages/ui/src/HookReviewDialog',
    'packages/ui/src/HooksSettings'], areas: ['configStartup', 'notice'] },
  { paths: ['packages/ui/src/StartSessionDialog', 'packages/ui/src/start-session-'], areas: ['git', 'configStartup'] },
  { paths: ['packages/ui/src/ProviderDialog'], areas: ['configStartup'] },
  { paths: ['packages/ui/src/attachments'], areas: ['tools'] },
  { paths: ['packages/ui/src/requirements/'], areas: ['requirements'] },
  { paths: ['packages/ui/src/TranscriptSurface'], areas: ['transcript'] },
  { paths: ['packages/ui/'],
    review: 'ui package file with no specific rule — name the surface suite this file draws' },
  { paths: ['packages/ui-core/src/replica'], areas: ['transcript'] },
  { paths: ['packages/ui-core/src/notice', 'packages/ui-core/src/acknowledgements'], areas: ['notice'] },
  { paths: ['packages/ui-core/src/requirements/'], areas: ['requirements'] },
  { paths: ['packages/ui-core/'], areas: ['transcript'] },

  // --- desktop scripts / resources ---
  { paths: ['apps/desktop/scripts/lib/'],
    review: 'shared proof harness — name the suites that import the helper' },
  { paths: ['apps/desktop/scripts/live-run.mjs'],
    areas: ['known'], notes: ['live-run is never automatic (AGENTS.md)'] },
  { paths: ['apps/desktop/scripts/fixtures/'], areas: ['known'],
    notes: ['live-run fixture; a change here is not a product proof of the app'] },
  { paths: ['apps/desktop/scripts/ui-audit.mjs', 'apps/desktop/scripts/ui-review.mjs'],
    areas: ['known'], notes: ['ui-audit / ui-review are report-only'] },
  { paths: ['apps/desktop/scripts/autopsy.mjs'], areas: ['known'] },
  { paths: ['apps/desktop/scripts/code-intelligence/'], areas: ['tools'] },
  { paths: ['apps/desktop/scripts/'], areas: ['known'] },
  { paths: ['apps/desktop/resources/'], areas: ['configStartup'] },
  { paths: ['apps/desktop/scripts/package.mjs'], areas: ['configStartup'] },

  // --- tools / docs / repo meta ---
  { paths: ['tools/symbol-artifact/', 'tools/check-directive-register'], areas: ['record'] },
  { paths: ['tools/verify-plan/'], areas: ['known'] },
  { paths: ['tools/'], areas: ['known'] },
  { paths: ['docs/spec/', 'docs/product/directives.md'], areas: ['record'] },
  { paths: ['docs/design/'], areas: ['themeLayout'] },
  { paths: ['docs/architecture/views/'], areas: ['known'],
    notes: ['architecture views: consult before, maintain after — no product proof'] },
  { paths: ['docs/'], areas: ['known'] },
  { paths: ['eslint.config.js'],
    views: ['docs/architecture/views/01-component-view.md'],
    review: 'the allowed-edge matrix is this file verbatim' },
  { paths: ['package.json', 'pnpm-workspace.yaml'],
    views: ['docs/architecture/views/01-component-view.md'],
    review: 'workspace scripts or pins — name the proofs a new script belongs to' },
  { paths: ['.agents/', '.claude/', '.github/'], areas: ['known'] },
  { paths: ['AGENTS.md', 'CLAUDE.md', 'CONTEXT-MAP.md', 'pnpm-lock.yaml',
    '.gitattributes', '.gitignore', 'tsconfig.json', 'vitest.config.ts'], areas: ['known'] },
]);
