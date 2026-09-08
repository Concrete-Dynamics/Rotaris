import { describe, expect, it } from 'vitest';
import { PUBLIC_TOOL_NAMES, TOOL_IMPLEMENTATIONS, DISPLAY_LINE_CAP_CHOICES } from '@rotaris/contracts';
import { LEGAL_BASE, LEGAL_DOCUMENTS, NO_THIRD_PARTY_BUNDLE, PRODUCT_LICENCE, PUBLISHER, SECURITY_CONTACT } from './About.js';
import { SETTINGS_CATEGORIES } from '../SettingsView.js';

describe('REQ-CONFIG-268/269 — the category bar', () => {
  it('presents the thirteen categories in the requirement’s order, under its identifiers', () => {
    expect(SETTINGS_CATEGORIES.map((c) => c.id)).toEqual([
      'models', 'personas', 'runtime', 'interface', 'display', 'skills', 'instructions', 'hooks', 'mcp', 'plugins', 'tools', 'project', 'about',
    ]);
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
