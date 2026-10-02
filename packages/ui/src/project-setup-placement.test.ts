import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppShell } from './AppShell.js';

/**
 * REQ-WORKSPACE-106 / ADR-0048 — the project setup dialog is a non-modal, window-level dialog and "the rest of the app stays
 * navigable". Fixed at the window's top corner it lay over the title bar's Sessions, Minimize, Maximize and Close window and
 * the notice banner's answers (`docs/defects/fixed/the-project-setup-dialog-is-drawn-over-the-title-bar-window-controls.md`,
 * measured in the built app). It now stands in the rail-and-view region, AppShell's `windowDialog` slot, which begins below
 * the title bar and the notice slot at any notice height.
 */
const css = readFileSync(new URL('./shell.css', import.meta.url), 'utf8');
const rulesOf = (selector: string): string[] => [...css.matchAll(new RegExp(`(?:^|\\n|\\})\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]+)\\}`, 'g'))].map((m) => m[1] ?? '');
const shell = (windowDialog?: ReturnType<typeof createElement>) => renderToStaticMarkup(createElement(AppShell, { version: '0.0.0', workspacePath: '/w', home: '/h', sessionName: null, onChooseWorkspace: () => undefined, statusItems: [], ...(windowDialog ? { windowDialog } : {}) }));

describe('the project setup dialog stands below the window chrome (REQ-WORKSPACE-106, ADR-0048, REQ-SHELL-024)', () => {
  it('AppShell draws the window dialog inside the rail-and-view region, after the title bar and the notice slot', () => {
    const html = shell(createElement('section', { className: 'dialog project-setup', 'data-testid': 'project-setup-dialog' }));
    const body = html.indexOf('class="body"');
    const dialog = html.indexOf('data-testid="project-setup-dialog"');
    expect(body).toBeGreaterThan(html.indexOf('class="title-bar"'));
    expect(body).toBeGreaterThan(html.indexOf('class="notice-slot"'));
    expect(dialog).toBeGreaterThan(body);
    expect(dialog).toBeLessThan(html.indexOf('class="status-strip"'));
    expect(shell()).not.toContain('project-setup');
  });

  it('is positioned against that region — absolute at its top corner with the language\'s inset, never fixed to the window', () => {
    const own = rulesOf('.project-setup').join(' ');
    expect(own).not.toMatch(/position\s*:\s*fixed/);
    expect(own).toMatch(/position\s*:\s*absolute/);
    expect(own).toMatch(/top\s*:\s*var\(--rt-space-4\)/);
    expect(own).toMatch(/right\s*:\s*var\(--rt-space-4\)/);
    // Bounded by the region, not the window, so it never reaches back over the title bar or the strip.
    expect(own).toMatch(/max-height\s*:\s*calc\(100% - 2 \* var\(--rt-space-4\)\)/);
    expect(own).not.toMatch(/100vh|100vw/);
    expect(rulesOf('.body').join(' ')).toMatch(/position\s*:\s*relative/);
  });

  it('shorter than it needs (the minimum window with a notice standing), the card scrolls and its answers stay at its floor', () => {
    expect(rulesOf('.project-setup').join(' ')).toMatch(/overflow\s*:\s*auto/);
    const answers = rulesOf('.project-setup > .dialog-actions').join(' ');
    expect(answers).toMatch(/position\s*:\s*sticky/);
    expect(answers).toMatch(/(^|[\s;])bottom\s*:/);
    expect(answers).toMatch(/background\s*:\s*var\(--rt-surface\)/);
  });
});
