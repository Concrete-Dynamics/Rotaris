import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ConfigSnapshot } from '@rotaris/contracts';
import { SkillsSettings } from './SkillsSettings.js';

/**
 * OQ-279 (ruled 2026-10-13 under R-072) read with REQ-CONFIG-478: the Skills category edits configuration, and a fatal load
 * leaves the configuration unloaded rather than defaulted — so the category draws the report, as Models, Personas and
 * Runtime do, and no row, switch or action. Before 2026-10-14 it drew the run host's projection of the shipped defaults
 * (docs/defects/fixed/the-skills-instructions-and-queue-readers-fall-back-to-defaults-on-a-fatal-load.md).
 */
const REPORT = '/g/agents.yaml at hooks.entries.0.timeout_seconds (global scope): must be at least 1.';
const props = {
  state: { enabled: true, skills: [], skipped: [] }, workspace: '/w', home: '/h',
  onLoadMode: () => undefined, onInvocationMode: () => undefined, onEnabled: () => undefined,
  onRescan: async () => ({ ok: true as const, count: 0 }), onLoadFile: async () => ({ ok: true as const, cancelled: true }),
};

describe('the Skills category on a configuration that does not load (OQ-279, REQ-CONFIG-478)', () => {
  it('draws the fatal report in place of the table, the switch and the two actions', () => {
    const fatal = { loadOk: false, fatal: REPORT, files: { workspace: '/w/.rotaris/agents.yaml', global: '/g/agents.yaml' } } as unknown as ConfigSnapshot;
    const html = renderToStaticMarkup(createElement(SkillsSettings, { ...props, fatal }));
    expect(html).toContain('Configuration could not be loaded');
    expect(html).toContain(REPORT);
    expect(html).not.toContain('data-testid="skills-enabled"');
    expect(html).not.toContain('data-testid="skills-rescan"');
  });
  it('draws the category as before when the configuration loaded', () => {
    const loaded = { loadOk: true } as unknown as ConfigSnapshot;
    const html = renderToStaticMarkup(createElement(SkillsSettings, { ...props, fatal: loaded }));
    expect(html).toContain('data-testid="skills-enabled"');
    expect(html).not.toContain('Configuration could not be loaded');
  });
});
