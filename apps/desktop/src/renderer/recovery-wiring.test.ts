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
    expect(text.match(/const needsRecovery = useNeedsRecovery\(session\?\.id \?\? null, session\?\.executionStatus \?\? null\);/g)).toHaveLength(3);
    const start = text.indexOf('<WorkspaceView ');
    const element = text.slice(start, text.indexOf('/></>;', start));
    expect(start).toBeGreaterThan(-1);
    expect(element).toMatch(/\sneedsRecovery=\{needsRecovery\}\s/);
  });

  /*
   * REQ-SHELL-038 with REQ-CHAT-008: the window's status strip names the recovery state as the run header and the Mission
   * view do (`statusStripRunItem`, pinned in `packages/ui` by composer.test.ts), from the third of main.tsx's
   * `useNeedsRecovery` calls, the one the window root makes. Handing it `false`, or naming the status without it, would
   * read "run Running" beside a run-level agent drawn `paused` (PD-ORCH-005 clause 13, OQ-100) and fails here. Since
   * acceptance A35 (REQ-MONITOR-127, OQ-165) the status it names is the one the window's surfaces show — the record under
   * this window's optimistic cancels (`useShownSession`), so a confirmed run cancel reads `cancelling` there too.
   */
  it('main.tsx names the strip\'s run item from the recovery fact, over the status the window shows', () => {
    const text = source('main.tsx');
    expect(text).toContain('statusStripRunItem(shownStatus, needsRecovery)');
    expect(text).toContain('const shownStatus = useShownSession()?.executionStatus ?? null;');
    expect(text).not.toMatch(/`run \$\{STATUS_LABELS/);
  });
});
