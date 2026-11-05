/**
 * The window name `part-j-proof`'s two-window launch gives `useWindow`, against the paths that exposed the defect: the
 * driver answered `"workspace":"C:\\…\\part-j-proof\\pair-b\\workspace"` and no window matched `"pair-b/workspace"`
 * (`docs/archive/defects/part-j-proofs-two-window-launch-names-a-window-by-a-forward-slash-suffix-that-never-matches-on-windows.md`).
 */
import { describe, expect, it } from 'vitest';
import { workspaceSuffix } from './window-suffix.mjs';

// The driver seam's match (`apps/desktop/src/main/index.ts`, `window`), restated: a case-blind suffix of the path.
const matches = (workspace: string, which: string) => workspace.toLowerCase().endsWith(which.toLowerCase());

const windowsB = 'C:\\dev\\Rotaris-wt-hrda-a1-6\\.proof\\part-j-proof\\pair-b\\workspace';
const windowsA = 'C:\\dev\\Rotaris-wt-hrda-a1-6\\.proof\\part-j-proof\\pair-a\\workspace';
const posixB = '/root/Rotaris/.proof/part-j-proof/pair-b/workspace';

describe('workspaceSuffix (part-j-proof two-window launch)', () => {
  it('names a Windows window by a backslash suffix that the driver matches', () => {
    const b = workspaceSuffix(['pair-b', 'workspace'], 'win32');
    expect(b).toBe('pair-b\\workspace');
    expect(matches(windowsB, b)).toBe(true);
    expect(matches(windowsA, b)).toBe(false);
    // The name the proof gave before: no Windows window ever matched it.
    expect(matches(windowsB, 'pair-b/workspace')).toBe(false);
  });

  it('keeps the forward slash where the platform writes one', () => {
    for (const platform of ['linux', 'darwin'] as const) {
      const b = workspaceSuffix(['pair-b', 'workspace'], platform);
      expect(b).toBe('pair-b/workspace');
      expect(matches(posixB, b)).toBe(true);
    }
  });

  it('reads the host platform when none is given', () => {
    expect(workspaceSuffix(['pair-a', 'workspace'])).toBe(process.platform === 'win32' ? 'pair-a\\workspace' : 'pair-a/workspace');
  });
});
