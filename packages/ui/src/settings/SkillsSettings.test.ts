import { describe, expect, it } from 'vitest';
import { shadowTooltip } from './SkillsSettings.js';

describe('the Source cell tooltip for a shadowing skill (REQ-WORKSPACE-067, REQ-SHELL-044)', () => {
  it('names one ignored duplicate in the singular and several in the plural, one path per line', () => {
    expect(shadowTooltip(['/home/u/.rotaris/skills/pdf/SKILL.md'])).toBe('Workspace skill wins. Ignored duplicate:\n/home/u/.rotaris/skills/pdf/SKILL.md');
    expect(shadowTooltip(['/a/SKILL.md', '/b/SKILL.md'])).toBe('Workspace skill wins. Ignored duplicates:\n/a/SKILL.md\n/b/SKILL.md');
  });
});
