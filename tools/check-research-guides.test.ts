import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { DESIGN_HEADINGS, GUIDE_NAME, REQUIRED_HEADINGS, ageInDays, guideFiles, headings, inspect } from './check-research-guides.mjs';

const guide = (sections: string[], date = '**Review date:** 2026-11-01') =>
  `# 03. A guide\n\nScope.\n\n${date}\n**Status:** guidance.\n\n${sections.map((s, i) => `## ${i + 1}. ${s}\n\nText.\n`).join('\n')}`;

describe('check-research-guides (docs/research/design/README.md, "Shared document structure")', () => {
  it('reads headings with their numbering stripped', () => {
    expect(headings('## 1. Purpose and scope\n### 7.1 A note\n## References and further reading\n# Title\n')).toEqual([
      'Purpose and scope',
      'A note',
      'References and further reading',
    ]);
  });

  it('passes a design guide with a review date and every required section', () => {
    const text = guide(['Purpose and scope', ...DESIGN_HEADINGS, ...REQUIRED_HEADINGS]);
    expect(inspect('docs/research/design/03-x.md', text, { guide: true, design: true })).toEqual({ problems: [], reviewDate: '2026-11-01' });
  });

  it('fails a guide with no review date, and names the section it lacks', () => {
    const text = guide(['Purpose and scope', 'References and further reading'], '**Prepared:** 2026-11-01');
    const { problems } = inspect('docs/research/design/03-x.md', text, { guide: true, design: true });
    expect(problems).toEqual([
      'docs/research/design/03-x.md: no review-date line (`**Review date:** YYYY-MM-DD`)',
      'docs/research/design/03-x.md: no "How this applies here" section',
      'docs/research/design/03-x.md: no "Where this disagrees with the adopted material" section',
    ]);
  });

  it('accepts the optimization guides\' "Reference review date" and asks them only for the references section', () => {
    const text = guide(['References and further reading'], '**Reference review date:** 2026-09-21  ');
    expect(inspect('docs/research/optimization/01-x.md', text, { guide: true, design: false })).toEqual({ problems: [], reviewDate: '2026-09-21' });
  });

  it('asks a REFERENCES.md for its review date only', () => {
    expect(inspect('docs/research/design/REFERENCES.md', '# References\n\n**Review date:** 2026-11-01\n', { guide: false, design: true }).problems).toEqual([]);
    expect(inspect('docs/research/design/REFERENCES.md', '# References\n', { guide: false, design: true }).problems).toHaveLength(1);
  });

  it("counts a review date's age in whole days and never below zero", () => {
    const now = Date.parse('2026-11-11T12:00:00Z');
    expect(ageInDays('2026-11-01', now)).toBe(10);
    expect(ageInDays('2026-12-01', now)).toBe(0);
    expect(ageInDays('not-a-date', now)).toBeNull();
  });

  it('reads this repository: both corpora, every numbered guide and each REFERENCES.md', () => {
    const files = guideFiles(resolve(import.meta.dirname, '..')) as { path: string }[];
    const paths = files.map((f) => f.path);
    expect(paths).toContain('docs/research/optimization/01-hashline-read-and-edit.md');
    expect(paths).toContain('docs/research/optimization/REFERENCES.md');
    expect(paths).toContain('docs/research/design/01-how-ai-design-tools-design.md');
    expect(paths).toContain('docs/research/design/REFERENCES.md');
    expect(paths.filter((p) => p.startsWith('docs/research/design/') && GUIDE_NAME.test(p.split('/').pop() ?? ''))).toHaveLength(14);
    expect(files.find((f) => f.path.endsWith('design/README.md'))).toBeUndefined();
  });
});
