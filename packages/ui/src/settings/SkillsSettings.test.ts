import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SKILLS_DISCOVERING_NOTE } from '@rotaris/contracts';
import { shadowTooltip, SKILLS_EMPTY, SkillsSettings, type SkillsSettingsProps } from './SkillsSettings.js';

describe('the Source cell tooltip for a shadowing skill (REQ-WORKSPACE-067, REQ-SHELL-044)', () => {
  it('names one ignored duplicate in the singular and several in the plural, one path per line', () => {
    expect(shadowTooltip(['/home/u/.rotaris/skills/pdf/SKILL.md'])).toBe('Workspace skill wins. Ignored duplicate:\n/home/u/.rotaris/skills/pdf/SKILL.md');
    expect(shadowTooltip(['/a/SKILL.md', '/b/SKILL.md'])).toBe('Workspace skill wins. Ignored duplicates:\n/a/SKILL.md\n/b/SKILL.md');
  });
});

describe('the list before there is an answer about the catalogue (OQ-386 point 1)', () => {
  const render = (props: Partial<SkillsSettingsProps>) => renderToStaticMarkup(createElement(SkillsSettings, {
    state: null, workspace: 'C:/w', onLoadMode: () => undefined, onInvocationMode: () => undefined, onEnabled: () => undefined,
    onRescan: async () => ({ ok: true as const, count: 0 }), onLoadFile: async () => ({ ok: true as const, cancelled: true }), ...props,
  }));
  it('says the skills are being discovered, and never that none were', () => {
    const html = render({ listNote: SKILLS_DISCOVERING_NOTE });
    expect(html).toContain(SKILLS_DISCOVERING_NOTE);
    expect(html).not.toContain(SKILLS_EMPTY);
  });
  it('shows the refusal a read met in the list place', () => {
    const html = render({ listNote: 'The portable skills could not be read: EIO' });
    expect(html).toContain('The portable skills could not be read: EIO');
    expect(html).not.toContain(SKILLS_EMPTY);
  });
  it('says none were discovered only on an answer', () => {
    expect(render({ state: { enabled: true, skills: [], skipped: [] }, listNote: null })).toContain(SKILLS_EMPTY);
  });
  it('keeps the no-workspace sentence whatever the note says', () => {
    const html = render({ workspace: null, listNote: SKILLS_DISCOVERING_NOTE });
    expect(html).toContain('No workspace is open');
    expect(html).not.toContain(SKILLS_DISCOVERING_NOTE);
  });
});
