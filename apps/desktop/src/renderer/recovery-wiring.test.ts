import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * PD-ORCH-005 clause 13 (revision 4, OQ-73): in REQ-CHAT-008's recovery state the run-level agent presents `paused` on
 * every surface that draws it — the Workspace (which `WorkspaceView` is handed `needsRecovery` for), the Mission view and
 * a persona window. The two renderer roots that draw it outside the Workspace mount under Electron, with a preload and a
 * replica no `node` test environment reaches, so what pins them is their source: each takes the recovery fact from
 * `useNeedsRecovery` and hands that same value to `restingView`, whose third argument is required. Handing it `false`, or
 * drawing the run-level agent through any other call, fails here; the helper itself is pinned in `packages/ui`
 * (`cancel-paused.test.ts`, "restingView answers the run-level agent and the rest from the one recovery fact").
 */
describe('PD-ORCH-005 clause 13 (OQ-73): the Mission root and a persona window draw the run-level agent from the recovery fact', () => {
  const source = (file: string): string => readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
  for (const [file, session] of [['main.tsx', 'session'], ['windows.tsx', 'state.session']] as const) it(file, () => {
    const text = source(file);
    expect(text).toContain(`const needsRecovery = useNeedsRecovery(${session}?.id ?? null, ${session}?.executionStatus ?? null);`);
    expect(text).toContain(`restingView(${session}, entry, needsRecovery)`);
    expect(text).not.toMatch(/\brunLevelAgent\b/);
  });
});
