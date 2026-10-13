import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * ADR-0051 decision 4 (REQ-LIBRARY-132's Preview, REQ-CHAT-076's opener): a link in an artifact's Preview requests an external
 * open through the command channel. `Markdown` draws a link DISABLED when it is given no opener, so every mount of the
 * artifact inspector has to hand it the window's shared `openLink` (`shell.ts`, which sends `shell.openExternal` and
 * acknowledges the outcome). The renderer roots mount under Electron, with a preload no `node` test environment reaches, so
 * their source is what pins it, as `agent-links-wiring.test.ts` pins its own; `pnpm artifacts-proof` launch 4 clicks a
 * Preview link in the built app (`docs/defects/fixed/every-link-in-the-library-artifact-inspectors-preview-is-drawn-disabled.md`).
 */
describe('every artifact inspector mount opens its Preview links (ADR-0051 decision 4)', () => {
  const source = (file: string): string => readFileSync(new URL(`./${file}`, import.meta.url), 'utf8');
  /** Each `<ArtifactInspector …>` element, from its tag to the end of its opening element. */
  const mounts = (text: string): string[] => [...text.matchAll(/<ArtifactInspector\b[\s\S]*?\/>/g)].map((m) => m[0]);

  it.each([['main.tsx', 'the main window\'s Library'], ['windows.tsx', 'the persona window']])('%s (%s) passes the shared opener to its one inspector mount', (file) => {
    const found = mounts(source(file));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('onOpenLink={openLink}');
  });

  it('the opener each root passes is the shared one from shell.ts, never a local stand-in', () => {
    for (const file of ['main.tsx', 'windows.tsx']) expect(source(file)).toMatch(/import \{[^}]*\bopenLink\b[^}]*\} from '\.\/shell\.js';/);
  });

  it('main.tsx no longer says that the open command does not exist', () => {
    expect(source('main.tsx')).not.toMatch(/No such\s+(\/\/\s+)?command exists yet/);
  });
});
