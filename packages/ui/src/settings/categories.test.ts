import { describe, expect, it } from 'vitest';
import { PUBLIC_TOOL_NAMES, TOOL_IMPLEMENTATIONS, DISPLAY_LINE_CAP_CHOICES } from '@rotaris/contracts';
import { LEGAL_BASE, LEGAL_DOCUMENTS, NO_THIRD_PARTY_BUNDLE, PRODUCT_LICENCE, PUBLISHER, SECURITY_CONTACT } from './About.js';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { categoryFocusMove, SETTINGS_CATEGORIES, SETTINGS_CATEGORY_GROUPS, SettingsView } from '../SettingsView.js';

describe('REQ-CONFIG-268/269 — the category list, under PD-CONFIG-008\'s headings', () => {
  it('presents the thirteen categories in the requirement’s order, under its identifiers', () => {
    expect(SETTINGS_CATEGORIES.map((c) => c.id)).toEqual([
      'models', 'personas', 'runtime', 'interface', 'display', 'skills', 'instructions', 'hooks', 'mcp', 'plugins', 'tools', 'project', 'about',
    ]);
  });

  it('PD-CONFIG-008: four headings over that order — Agents, Application, Extensions, Project and about — and no heading repeats a sole member', () => {
    expect(SETTINGS_CATEGORY_GROUPS.map((g) => [g.label, g.categories.map((c) => c.label)])).toEqual([
      ['Agents', ['Models', 'Personas', 'Runtime']],
      ['Application', ['Interface', 'Display']],
      ['Extensions', ['Skills', 'Instructions', 'Hooks', 'MCP Servers', 'Plugins', 'Tools']],
      ['Project and about', ['Project', 'About']],
    ]);
    for (const group of SETTINGS_CATEGORY_GROUPS) expect(group.categories.length).toBeGreaterThan(1);
  });

  it('PD-CONFIG-008: a heading is text naming its group — never an option, never focusable', () => {
    const html = renderToStaticMarkup(createElement(SettingsView, { session: null, workspace: null, onBackup: async () => ({ ok: true as const }), onRestore: async () => ({ ok: true as const }) }));
    expect(html.match(/role="group"/g)).toHaveLength(4);
    expect(html.match(/role="option"/g)).toHaveLength(13);
    for (const group of SETTINGS_CATEGORY_GROUPS) {
      expect(html).toContain(`role="group" aria-labelledby="settings-group-${group.id}"`);
      expect(html).toMatch(new RegExp(`<div[^>]*id="settings-group-${group.id}"[^>]*>${group.label}</div>`));
    }
    expect(html).not.toMatch(/<div[^>]*nav-list__heading[^>]*(tabindex|role="option")/);
  });
});

describe('REQ-SHELL-153 on the category list — the four keys move focus, never the selection', () => {
  const count = SETTINGS_CATEGORIES.length;
  it('Arrow Down and Arrow Up step by one entry and pass a group\'s heading as though it were not there (PD-CONFIG-008)', () => {
    // Runtime is the last of "Agents" and Interface the first of "Application": one step apart, in both directions.
    const runtime = SETTINGS_CATEGORIES.findIndex((c) => c.id === 'runtime');
    const next = categoryFocusMove('ArrowDown', runtime, count);
    expect(SETTINGS_CATEGORIES[next!]!.id).toBe('interface');
    expect(categoryFocusMove('ArrowUp', next!, count)).toBe(runtime);
  });
  it('Home reaches Models and End reaches About', () => {
    expect(SETTINGS_CATEGORIES[categoryFocusMove('Home', 7, count)!]!.id).toBe('models');
    expect(SETTINGS_CATEGORIES[categoryFocusMove('End', 7, count)!]!.id).toBe('about');
  });
  it('movement stops at either end and no other key moves focus', () => {
    expect(categoryFocusMove('ArrowUp', 0, count)).toBeNull();
    expect(categoryFocusMove('ArrowDown', count - 1, count)).toBeNull();
    expect(categoryFocusMove('Home', 0, count)).toBeNull();
    for (const key of ['ArrowLeft', 'ArrowRight', 'Enter', ' ', 'Tab', 'a']) expect(categoryFocusMove(key, 3, count)).toBeNull();
  });
});

describe('REQ-CONFIG-277 / REQ-TOOLS-165 — the Tools inventory', () => {
  it('names a runtime target for every public tool, and says so where the build registers none', () => {
    for (const name of PUBLIC_TOOL_NAMES) expect(TOOL_IMPLEMENTATIONS).toHaveProperty(name);
    // `git_commit` is a declared name this build implements nowhere; the inventory reports that rather than inventing a symbol.
    expect(TOOL_IMPLEMENTATIONS.git_commit).toBeNull();
    expect(Object.entries(TOOL_IMPLEMENTATIONS).filter(([, target]) => target === null).map(([name]) => name)).toEqual(['git_commit']);
    // REQ-TOOLS-001: the alias resolves to the same implementation as the name it aliases.
    expect(TOOL_IMPLEMENTATIONS.haet).toBe(TOOL_IMPLEMENTATIONS.haet_edit);
  });

  it('is sorted by name, and is the full public vocabulary', () => {
    const sorted = [...PUBLIC_TOOL_NAMES].sort((a, b) => a.localeCompare(b));
    expect(sorted[0]).toBe('artifact_list');
    expect(sorted).toHaveLength(PUBLIC_TOOL_NAMES.length);
    expect(new Set(sorted)).toEqual(new Set(PUBLIC_TOOL_NAMES));
  });
});

describe('REQ-SHELL-140..142 — the About page’s fixed values', () => {
  it('carries the publisher, the security contact and the licence the requirement states', () => {
    expect(PUBLISHER).toBe('Concrete Dynamics UG (haftungsbeschränkt)');
    expect(SECURITY_CONTACT).toBe('security@concrete-dynamics.com');
    expect(PRODUCT_LICENCE).toBe('GPL-3.0-only');
    expect(NO_THIRD_PARTY_BUNDLE).toBe('This build does not carry a third-party license bundle.');
  });

  it('REQ-SHELL-141: five documents, in order, at the exact paths under one base', () => {
    expect(LEGAL_BASE).toBe('https://rotaris.ai');
    expect(LEGAL_DOCUMENTS.map((d) => [d.name, `${LEGAL_BASE}${d.path}`])).toEqual([
      ['Privacy Policy', 'https://rotaris.ai/privacy'],
      ['EULA', 'https://rotaris.ai/eula'],
      ['Terms / AGB', 'https://rotaris.ai/terms'],
      ['Acceptable Use Policy', 'https://rotaris.ai/acceptable-use'],
      ['Withdrawal / Widerrufsbelehrung', 'https://rotaris.ai/widerruf'],
    ]);
  });
});

describe('REQ-CONFIG-472 — the caps the Display category offers', () => {
  it('offers 1, 2, 5, 10, 20, 50 and unlimited, in that order', () => {
    expect(DISPLAY_LINE_CAP_CHOICES).toEqual([1, 2, 5, 10, 20, 50, null]);
  });
});
