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
   * item, so no strip text can disagree with the run header about the recovery state; the run header, the Workspace
   * badge and the Mission view carry it.
   */
  it('main.tsx draws no run state in the status strip', () => {
    const text = source('main.tsx');
    expect(text).not.toContain('statusStripRunItem');
    expect(text).not.toMatch(/`run \$\{STATUS_LABELS/);
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
