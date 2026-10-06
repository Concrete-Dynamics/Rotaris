import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { statusStripSandboxItem, stripItems, type StripFacts, type StripItem } from './composer.js';
import { StatusStripItem } from './StatusStripItem.js';

/**
 * The strip's branch item as drawn. The markup is what a unit test can read (a static render runs no layout effect, so no
 * measurement); the shortening itself and the path giving up its width first are driven in the built app (`pnpm
 * layout-proof` section 7, `pnpm git-proof`).
 */
const facts = (branch: StripFacts['branch']): StripFacts => ({
  workspace: { label: '/tmp/a-deep-scratch-directory/349f6b0e-6880-59f4-942d-818d53f7b76a/proj-folder', path: '/tmp/a-deep-scratch-directory/349f6b0e-6880-59f4-942d-818d53f7b76a/proj-folder', open: () => undefined },
  branch,
  safety: { circuitBreakerArmed: false, unsavedSettings: false, outsideWorkspace: false, mode: 'mode: ask' },
  sandbox: statusStripSandboxItem({ sandboxed: false, sandboxBackend: '' }),
  model: { name: 'scripted', label: 'model: scripted' },
  tokens: 0,
  cost: null,
  backgroundSessions: 0,
});
const branchMarkup = (branch: StripFacts['branch']) => {
  const item = stripItems(1400, facts(branch)).find((i): i is Exclude<StripItem, { kind: 'spacer' }> => i.kind !== 'spacer' && i.testId === 'strip-branch');
  if (!item) throw new Error('no branch item');
  return renderToStaticMarkup(createElement(StatusStripItem, { item }));
};

describe('the status strip\'s branch item, drawn (REQ-GIT-161, REQ-WORKSPACE-149 rule 2, REQ-SHELL-042)', () => {
  it('draws the state words whole, as plain text, never under rule 2\'s middle shortening (OQ-193\'s build reading)', () => {
    // Until the 2026-10-03 repair round a long path beside the item cut `no git repository` to `no …ry`.
    for (const [text, state] of [['no git repository', 'none'], ['no git', 'none'], ['detached HEAD', 'detached'], ['—', 'unknown']] as const) {
      const html = branchMarkup({ text, title: 'state', state });
      expect(html).not.toContain('data-middle');
      expect(html).not.toContain('status-strip__label');
      expect(html).not.toContain('ph-git-branch');
      expect(html).toContain(`>${text}</span>`);
    }
  });

  it('REQ-WORKSPACE-020: the empty item (an unborn branch) draws no text, no icon, no tooltip and no description, and keeps its name', () => {
    const html = branchMarkup({ text: '', title: '', description: '', state: 'empty' });
    expect(html).not.toContain('ph-git-branch');
    expect(html).not.toContain('title=');
    expect(html).not.toContain('aria-description');
    expect(html).not.toContain('data-middle');
    expect(html).toContain('aria-label="Checked-out branch"');
    expect(html).toMatch(/data-testid="strip-branch"><\/span>$/u);
  });

  it('draws a branch name as a rule-2 label after the accent icon, its ahead marker a whole suffix', () => {
    const html = branchMarkup({ text: 'main', suffix: ' ↑1', title: 'Branch this workspace is on: main, 1 commit ahead.', state: 'branch' });
    expect(html).toContain('data-middle="1"');
    expect(html).toMatch(/<i class="ph ph-git-branch status-strip__icon" aria-hidden="true"><\/i><span class="status-strip__label">main<\/span><span class="status-strip__suffix"> ↑1<\/span>/u);
  });

  it('REQ-WORKSPACE-020: an isolated worktree\'s branch draws its own ahead marker, the base sentence as its title, and the worktree only in its description', () => {
    const title = 'Branch this workspace is on: rotaris/session/S, 1 commit ahead.';
    const description = `${title} It belongs to the isolated worktree the active run is using, not to the folder this window is open on.`;
    const html = branchMarkup({ text: 'rotaris/session/S', suffix: ' ↑1', title, description, state: 'branch' });
    expect(html).toContain(`title="${title}"`);
    expect(html).toContain(`aria-description="${description}"`);
    expect(html).toContain('<span class="status-strip__suffix"> ↑1</span>');
    // The base checkout's item: the tooltip and the description one and the same string.
    const base = branchMarkup({ text: 'main', title: 'Branch this workspace is on: main.', state: 'branch' });
    expect(base).toContain('title="Branch this workspace is on: main."');
    expect(base).toContain('aria-description="Branch this workspace is on: main."');
  });
});
