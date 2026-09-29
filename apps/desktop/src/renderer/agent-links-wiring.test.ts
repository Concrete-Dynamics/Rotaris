import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Live-run finding K1 (R-067). The renderer roots mount under Electron, with a preload and a replica no `node` test
 * environment reaches, so what pins their part of the repair is their source (as `recovery-wiring.test.ts` pins its own):
 * - REQ-MONITOR-060: the stand-in for an agent with no resolved set is the role's DECLARED tools (`declaredTools`, the
 *   built-in role's list when the files state none). Reading the role's `tools` — what the files state, empty for every
 *   built-in role — is what drew "No tools resolved." for the run-level agent in every live-run screenshot.
 * - REQ-MONITOR-052 / REQ-LIBRARY-102/131: an artifact link in the main window deep-links to the Library, which opens the
 *   inspector for it; in a persona window it opens the artifact inspector in that window.
 */
describe('live-run finding K1: the renderer roots wire the declared tools and the artifact links', () => {
  const source = (file: string): string => readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');

  it('session-view.ts and windows.tsx let the declared tools stand in, never the files\' own `tools`', () => {
    const view = source('session-view.ts');
    expect(view).toContain('tools: r.declaredTools,');
    expect(view).toContain("tools: role?.declaredTools ?? [] };");
    expect(view).not.toMatch(/tools: (r|role\?)\.tools\b/);
    expect(source('windows.tsx')).toContain('?.declaredTools ?? [];');
  });

  it('main.tsx opens the artifact an agent surface asked for; windows.tsx opens it in the persona window', () => {
    const main = source('main.tsx');
    expect(main).toContain('useShellState((state) => state.libraryArtifactId)');
    expect(main).toContain('if (focusedArtifactId !== null) inspect(focusedArtifactId);');
    const windows = source('windows.tsx');
    expect(windows).toContain('onOpenArtifact={openArtifact}');
    expect(windows).toMatch(/<ArtifactInspector key=\{entry\.id\} id=\{entry\.id\} raised=\{entry\.raised\} onLoad=\{loadArtifact\} onSave=\{saveArtifact\}/);
  });
});
