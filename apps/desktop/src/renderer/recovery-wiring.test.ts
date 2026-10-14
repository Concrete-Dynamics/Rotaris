import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * PD-ORCH-005 clause 13 (revision 4, OQ-100): in REQ-CHAT-008's recovery state the run-level agent presents `paused` on
 * every surface that draws it — the Workspace (which `WorkspaceView` is handed `needsRecovery` for), the Mission view and
 * a persona window. The two renderer roots that draw it outside the Workspace mount under Electron, with a preload and a
 * replica no `node` test environment reaches, so what pins them is their source: each takes the recovery fact from
 * `useNeedsRecovery` and hands that same value to `restingView`, whose third argument is required. Handing it `false`, or
 * drawing the run-level agent through any other call, fails here; the helper itself is pinned in `packages/ui`
 * (`cancel-paused.test.ts`, "restingView answers the run-level agent and the rest from the one recovery fact").
 */
describe('PD-ORCH-005 clauses 13, 16 and 18 (OQ-100, OQ-101, OQ-103): the renderer roots draw from the recovery fact', () => {
  const source = (file: string): string => readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
  for (const [file, session] of [['main.tsx', 'session'], ['windows.tsx', 'session']] as const) it(file, () => {
    const text = source(file);
    expect(text).toContain(`const needsRecovery = useNeedsRecovery(${session}?.id ?? null, ${session}?.executionStatus ?? null);`);
    expect(text).toContain(`restingView(${session}, entry, needsRecovery)`);
    expect(text).not.toMatch(/\brunLevelAgent\b/);
  });

  /*
   * The repair of `docs/defects/fixed/the-mission-view-offers-pause-and-cancel-with-no-run-behind-the-session.md`: the
   * Mission view reads a run as active only when it is busy and not in recovery, so the root must hand it the same fact.
   * `recovery` is required, so dropping it fails typecheck; handing it `false` would offer Pause beside a root drawn
   * `paused` and fails here (`cancel-paused.test.ts` pins the view itself).
   */
  it('main.tsx hands the Mission view the same recovery fact', () => {
    expect(source('main.tsx')).toContain('recovery={needsRecovery}');
  });

  /*
   * What `restingView` answers must also reach the view, and each prop is a plain boolean or record, so handing a
   * constant in its place typechecks. PD-ORCH-005 clause 16: the Mission view's "Cancel selection" offers a paused child's
   * Cancel at rest only through `resting` (`cancelOffered`); clause 13: the run-level agent it and a persona window draw
   * is `runLevel`. Handing either a constant fails here.
   */
  it('main.tsx and windows.tsx hand the views what restingView answered', () => {
    expect(source('main.tsx')).toContain('runLevel={runLevel} resting={resting} recovery={needsRecovery}');
    expect(source('windows.tsx')).toContain('runLevel={runLevel}');
  });

  /*
   * The Workspace root reads the recovery fact itself (the first of main.tsx's two `useNeedsRecovery` calls) and hands it
   * to `WorkspaceView`, whose `needsRecovery` is optional and defaults to `false`. Clause 18's recovery-state offer — the
   * Continue action, the count and "continue without them" on a crash-left busy session — and clause 13's run-level
   * `paused` root in that state are drawn from it (`crashLeft` and `resting` in `WorkspaceView`), so handing it `false`,
   * or leaving it out, fails here.
   */
  it('main.tsx hands the Workspace the recovery fact (PD-ORCH-005 clauses 13 and 18)', () => {
    const text = source('main.tsx');
    expect(text.match(/const needsRecovery = useNeedsRecovery\(session\?\.id \?\? null, session\?\.executionStatus \?\? null\);/g)).toHaveLength(2);
    const start = text.indexOf('<WorkspaceView ');
    const element = text.slice(start, text.indexOf('/></>;', start));
    expect(start).toBeGreaterThan(-1);
    expect(element).toMatch(/\sneedsRecovery=\{needsRecovery\}\s/);
  });

  /*
   * REQ-SHELL-038 (a closed list) draws no run state in the status strip. Until 2026-10-02 the strip named it
   * (`statusStripRunItem`, from a third `useNeedsRecovery` call the window root made, so it read `Run needs recovery` as the
   * run header does: PD-ORCH-005 clause 13, OQ-100, acceptance A35). The strip's repair
   * (docs/defects/fixed/the-status-strip-applies-no-responsive-hiding-and-overflows-at-the-minimum-window.md) dropped the
   * item, so no strip text can disagree with the run header about the recovery state; the Workspace view's run header
   * and the Mission view's subtitle carry it.
   */
  it('main.tsx draws no run state in the status strip', () => {
    const text = source('main.tsx');
    expect(text).not.toContain('statusStripRunItem');
    expect(text).not.toMatch(/`run \$\{STATUS_LABELS/);
  });

  /*
   * REQ-SHELL-041 / REQ-TOOLS-184: `● CB armed` follows the saved `circuit_breaker.enabled` as the file-access flag follows
   * `runtime.allow_outside_workspace` — from the one configuration snapshot the strip re-reads on every change. Until
   * 2026-10-03 (fin10's repair round) the flag was `shell.hello`'s boot answer alone, so a breaker turned off in Settings
   * still read armed while the next run had none. The helper is pinned in `packages/ui` (`composer.test.ts`).
   */
  it('main.tsx arms the strip\'s circuit-breaker flag from the configuration snapshot, the host override still disarming it', () => {
    const text = source('main.tsx');
    expect(text).toContain('const circuitBreakerArmed = stripCircuitBreakerArmed(stripConfig?.circuitBreakerEnabled, circuitBreakerAtBoot, circuitBreakerHostOff);');
    expect(text).toMatch(/safety: \{ circuitBreakerArmed, /);
  });

  // REQ-TOOLS-184 ("never redraws when nothing it displays has changed"): the status memo depends on the focused session's
  // two displayed primitives, not the whole record, which every replica update replaces.
  it('main.tsx memoises the strip on the focused session\'s mode and background count, never the whole record', () => {
    const text = source('main.tsx');
    const memo = /const status = useMemo<readonly StatusItem\[\]>\([\s\S]*?\n {4}\[([^\]]*)\],\n {2}\);/.exec(text);
    expect(memo).not.toBeNull();
    const deps = memo![1]!.split(',').map((d) => d.trim());
    expect(deps).toEqual(expect.arrayContaining(['focusedMode', 'backgroundSessions']));
    expect(deps).not.toContain('session');
  });
});

/*
 * REQ-NOTIFY-045 (OQ-178): the window's dispatcher hands `retry-run` to `retryRun` with the draft the composer last
 * published, and no longer lists it among the members with no target. The dispatcher lives in the renderer root, which
 * no `node` test environment mounts, so its source is what pins it; `retryRun` itself is pinned in `session-actions.test.ts`.
 */
describe('REQ-NOTIFY-045: the retry action reaches its target', () => {
  const text = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');
  it('main.tsx dispatches retry-run to retryRun with the published draft', () => {
    const arm = text.slice(text.indexOf("case 'retry-run':"), text.indexOf("case 'open-cloud-account':"));
    expect(arm).toContain('let draft = composerDraft.current;');
    expect(arm).toContain('await retryRun(draft)');
    expect(text).not.toMatch(/case 'open-project-init':\s*case 'retry-run':/);
    expect(text).toContain('publish: (text: string) => { composerDraft.current = text; setPublished(text); }');
  });
});

/*
 * PD-WORKSPACE-005 revisions 2 and 3 (OQ-262, OQ-294): the project-setup banners' `open-project-init` action reaches main's
 * `projectInit.open`, which reaches the window holding the named workspace (or adds one), and that window opens
 * Settings › Project on channel 15. Until 2026-10-14 the arm sat among the members with no target and dispatched nothing.
 */
describe('PD-WORKSPACE-005 revision 3: the project-setup action reaches its target', () => {
  const text = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');
  it('main.tsx sends open-project-init to projectInit.open with the named workspace, and no longer lists it without a target', () => {
    const start = text.indexOf("case 'open-project-init':");
    expect(start).toBeGreaterThan(-1);
    const arm = text.slice(start, text.indexOf('return;', start));
    expect(arm).toContain("bridge.command({ kind: 'projectInit.open', workspace: action.workspace })");
    expect(text).not.toMatch(/case 'open-project-init':\s*case 'save-settings':/);
    expect(text).not.toMatch(/case 'open-cloud-account':\s*case 'open-project-init':/);
  });

  it('main.tsx opens Settings › Project when main asks this window on channel 15', () => {
    expect(text).toMatch(/const open = \(workspace: string \| undefined\) => \{[\s\S]*?useShellState\.getState\(\)\.openSettings\('project'\);[\s\S]*?const off = bridge\.onProjectInitOpen\(\(p\) => \{ open\(/);
  });

  // PD-WORKSPACE-005 revision 3 (OQ-294): a window the press added, or one met during its load, may not listen yet; once it
  // registers its listener it asks main for an open held for it, and opens Settings › Project when one was owed.
  it('main.tsx reports projectInit.ready right after registering for channel 15, and opens Settings › Project when one is owed', () => {
    expect(text).toMatch(/const off = bridge\.onProjectInitOpen\([\s\S]*?\);\s*void bridge\.command\(\{ kind: 'projectInit\.ready' \}\)\.then\(\(outcome\) => \{\s*if \(outcome\.ok && \(outcome\.value as \{ owed\?: boolean \} \| undefined\)\?\.owed === true\) open\(undefined\);/);
  });
});

/*
 * PD-SHELL-001 revision 3 (OQ-292, ruled 2026-10-14 under R-072): the `focus-session` arm hands the session and its workspace to
 * main (`session.focusFromNotice`), which reaches the window holding that workspace; that window focuses the session through its
 * own load on channel 16, and, once listening, asks main for a focus held while it loaded. The `fromNotice` silence is gone.
 */
describe('PD-SHELL-001 revision 3: a focus-session press reaches the window holding the session\'s workspace', () => {
  const text = readFileSync(new URL('./main.tsx', import.meta.url), 'utf8');
  it('main.tsx sends the session and its workspace from the focus-session arm to session.focusFromNotice', () => {
    const start = text.indexOf("case 'focus-session':");
    const arm = text.slice(start, text.indexOf("case 'open-library':", start));
    expect(arm).toContain("bridge.command({ kind: 'session.focusFromNotice', sessionId: action.sessionId, workspace: action.workspace })");
    expect(arm).not.toContain('session.resume');
    expect(text).not.toContain('fromNotice');
  });
  it('the reached window focuses the session on channel 16 through its own load, and asks for a held focus once listening', () => {
    expect(text).toMatch(/const off = bridge\.onSessionFocus\(\(p\) => \{[\s\S]*?focus\(sessionId\);[\s\S]*?\}\);\s*void bridge\.command\(\{ kind: 'session\.focusReady' \}\)\.then\(\(outcome\) => \{[\s\S]*?focus\(held\);/);
    expect(text).toContain("const focus = (sessionId: string) => { void openSession(sessionId)");
    expect(text).toContain("bridge.command({ kind: 'session.resume', sessionId })");
  });
});
