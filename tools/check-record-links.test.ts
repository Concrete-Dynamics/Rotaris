/**
 * The record-link gate, over a fixture on disk: one dangling link and one good anchor, which is
 * exactly the pair the gate has to tell apart — a slip it must fail, a heading link it must not.
 * The scan over the real record is `pnpm lint`'s own business.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error — the tools directory is plain ESM, run by node without a build step.
import { anchorsOf, checkCode, checkCodeFile, checkFile, checkProse, checkProseFile, checkRecord, codeFiles, defectPointers, extractLinks, partialDefectPaths, PROSE_EXEMPT, prosePointers, githubSlug, isRelative, withoutCode } from './check-record-links.mjs';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'record-links-'));
  mkdirSync(join(root, 'docs', 'defects', 'fixed'), { recursive: true });
  mkdirSync(join(root, 'docs', 'architecture'), { recursive: true });
  writeFileSync(
    join(root, 'docs', 'architecture', 'target.md'),
    ['# Target', '', '## 2. The store the run writes (`packages/store/src/schema.ts`, v22)', '', 'body', ''].join('\n'),
  );
  writeFileSync(join(root, 'docs', 'defects', 'fixed', 'a-note.md'), '## A note\n');
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('check-record-links — a dangling link fails, a good anchor passes', () => {
  it('fails the link to a note at its pre-fixed/ path, naming file, line and target', () => {
    const file = join(root, 'docs', 'architecture', 'first-executions.md');
    writeFileSync(
      file,
      [
        '# First executions',
        '',
        'A good one: [§2](target.md#2-the-store-the-run-writes-packagesstoresrcschemats-v22).',
        'A moved note: [`a-note.md`](../defects/a-note.md) — the repair left this behind.',
        '',
      ].join('\n'),
    );
    const problems = checkFile(file);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      file,
      line: 4,
      text: '`a-note.md`',
      target: '../defects/a-note.md',
      reason: 'the target does not exist',
    });
  });

  it('passes the same file once the link follows the note into fixed/', () => {
    const file = join(root, 'docs', 'architecture', 'first-executions.md');
    writeFileSync(file, '[`a-note.md`](../defects/fixed/a-note.md#a-note) and [§2](target.md#2-the-store-the-run-writes-packagesstoresrcschemats-v22)\n');
    expect(checkFile(file)).toEqual([]);
  });

  it('fails a fragment that names no heading in an existing file', () => {
    const file = join(root, 'docs', 'architecture', 'x.md');
    writeFileSync(file, '[§9](target.md#9-nothing-here)\n');
    expect(checkFile(file)).toMatchObject([{ line: 1, reason: 'no heading or anchor `#9-nothing-here` in the target' }]);
  });

  it('reads a same-file fragment against its own headings', () => {
    const file = join(root, 'docs', 'architecture', 'self.md');
    writeFileSync(file, '# Self\n\n[up](#self) [down](#nowhere)\n');
    expect(checkFile(file)).toMatchObject([{ line: 3, target: '#nowhere' }]);
  });

  it('walks docs/, the three root files and every packages CONTEXT.md, and nothing else', () => {
    mkdirSync(join(root, 'packages', 'engine', 'src', 'artifacts'), { recursive: true });
    writeFileSync(join(root, 'packages', 'engine', 'CONTEXT.md'), '[bad](nope.md)\n');
    writeFileSync(join(root, 'packages', 'engine', 'src', 'artifacts', 'CONTEXT.md'), '[bad](nope.md)\n');
    writeFileSync(join(root, 'packages', 'engine', 'README.md'), '[ignored](nope.md)\n');
    writeFileSync(join(root, 'CLAUDE.md'), '[bad](nope.md)\n');
    writeFileSync(join(root, 'README.md'), '[ignored](nope.md)\n');
    const { problems } = checkRecord(root);
    expect(problems.map((p: { file: string }) => p.file.slice(root.length + 1).replaceAll('\\', '/')).sort()).toEqual([
      'CLAUDE.md',
      'packages/engine/CONTEXT.md',
      'packages/engine/src/artifacts/CONTEXT.md',
    ]);
  });
});

describe('check-record-links — what is not a link', () => {
  it('skips links inside fenced code and inline code, and keeps line numbers', () => {
    const text = ['# T', '```md', '[in a fence](missing.md)', '```', 'Say `[inline](missing.md)` here.', '[real](missing.md)', ''].join(
      '\n',
    );
    const links = extractLinks(withoutCode(text), text);
    expect(links).toEqual([{ line: 6, text: 'real', target: 'missing.md' }]);
  });

  it('skips a ``` fence and a ~~~ fence that hold a blank line, which inline code alone would not hide', () => {
    // A fence with no blank line inside is hidden by the inline-code rule too (its ``` opener and
    // closer pair as one span), so it cannot show that the fence rule works. A blank line ends a
    // code span, and a tilde fence holds no backtick at all: only the fence rule blanks these two.
    const text = [
      '# T',
      '```md',
      '',
      '[in a fence](missing.md)',
      '```',
      '~~~',
      'x',
      '',
      '[tilde](missing.md)',
      '~~~',
      '[real](missing.md)',
      '',
    ].join('\n');
    expect(extractLinks(withoutCode(text), text)).toEqual([{ line: 11, text: 'real', target: 'missing.md' }]);
  });

  it('does not let a stray backtick pair across a blank line and hide the links between', () => {
    const text = ['A lone ` in one paragraph.', '', '[hidden?](missing.md)', '', 'and a ` in another.', ''].join('\n');
    expect(extractLinks(withoutCode(text), text)).toEqual([{ line: 3, text: 'hidden?', target: 'missing.md' }]);
    const wrapped = 'A span `that\nwraps [x](missing.md)` one line.\n';
    expect(extractLinks(withoutCode(wrapped), wrapped)).toEqual([]);
  });

  it('skips an HTML comment, which does not render', () => {
    const text = '<!-- [example](../defects/x.md) -->\n[kept](a.md)\n';
    expect(extractLinks(withoutCode(text), text)).toEqual([{ line: 2, text: 'kept', target: 'a.md' }]);
  });

  it('leaves absolute URLs and mail links to somebody else', () => {
    expect(isRelative('https://example.test/a.md')).toBe(false);
    expect(isRelative('mailto:x@example.test')).toBe(false);
    expect(isRelative('/site-root.md')).toBe(false);
    expect(isRelative('../a.md')).toBe(true);
    expect(isRelative('#anchor')).toBe(true);
  });

  it('reads a title and an angle-bracketed target', () => {
    const text = '[a](<spaced name.md> "title") [b](b.md \'t\')';
    expect(extractLinks(text).map((l) => l.target)).toEqual(['spaced name.md', 'b.md']);
  });
});

describe('check-record-links — GitHub heading slugs', () => {
  it('drops markup and punctuation, keeps hyphens and underscores, spaces to hyphens', () => {
    expect(githubSlug('7. The store the run writes (`packages/store/src/schema.ts`, v22)')).toBe(
      '7-the-store-the-run-writes-packagesstoresrcschemats-v22',
    );
    expect(githubSlug('**Bold** and ~~struck~~ [link](x.md) snake_case')).toBe('bold-and-struck-link-snake_case');
  });

  it('numbers a repeated heading and reads explicit anchors', () => {
    const anchors = anchorsOf('# Same\n## Same\n<a id="r-001"></a>R-001\n## Custom {#custom-id}\n```\n# not a heading\n```\n');
    expect([...anchors].sort()).toEqual(['custom', 'custom-id', 'r-001', 'same', 'same-1']);
  });
});

/*
 * The second pass: a `docs/defects/….md` path written in the code. The fixture's paths are assembled from parts, so that
 * this file — which the pass reads too — cites no note itself.
 */
const note = (...parts: string[]): string => ['docs', 'defects', ...parts].join('/');

describe('check-record-links — a defect-note path in the code must name a note that exists', () => {
  it('fails a comment citing a note at its pre-fixed/ path, naming file, line and path, and passes it once it follows the note', () => {
    mkdirSync(join(root, 'packages', 'ui', 'src'), { recursive: true });
    const file = join(root, 'packages', 'ui', 'src', 'row.tsx');
    writeFileSync(file, ['// the row', `// recorded as \`${note('a-note.md')}\`.`, 'export const x = 1;', ''].join('\n'));
    expect(checkCodeFile(root, file)).toEqual([{ file, line: 2, text: 'defect note', target: note('a-note.md'), reason: 'no note at this path' }]);
    writeFileSync(file, ['// the row', `// recorded as \`${note('fixed', 'a-note.md')}\`.`, 'export const x = 1;', ''].join('\n'));
    expect(checkCodeFile(root, file)).toEqual([]);
  });

  it('reads a path wherever it stands — a string a proof prints, a style sheet — and only a whole note name', () => {
    expect(defectPointers(`console.log('NOTE ${note('fixed', 'b.md')}');\n/* ${note('c.md')}#anchor */`).map((p: { line: number; target: string }) => [p.line, p.target])).toEqual([[1, note('fixed', 'b.md')], [2, note('c.md')]]);
    expect(defectPointers(`${note('…')}.md and ${note('*.md')} and ${note('README.mdx')}`)).toEqual([]);
  });

  it('walks apps/, packages/ and tools/ for code, skipping what a build or an install writes, and nothing else', () => {
    for (const dir of ['apps/desktop/src', 'apps/desktop/out/main', 'packages/ui/node_modules/x', 'packages/ui/src', 'tools', 'docs/defects']) mkdirSync(join(root, dir), { recursive: true });
    for (const file of ['apps/desktop/src/main.ts', 'apps/desktop/out/main/index.js', 'packages/ui/node_modules/x/index.js', 'packages/ui/src/shell.css', 'packages/ui/src/notes.md', 'tools/check.mjs', note('d.ts')]) writeFileSync(join(root, file), `// ${note('gone.md')}\n`);
    const rel = (codeFiles(root) as string[]).map((f) => f.slice(root.length + 1).split('\\').join('/'));
    expect(rel).toEqual(['apps/desktop/src/main.ts', 'packages/ui/src/shell.css', 'tools/check.mjs']);
    const { problems, pointers, files } = checkCode(root);
    expect([problems.length, pointers, files]).toEqual([3, 3, 3]);
  });

  it('fails a path a comment wraps across a line or abbreviates, since no pass can check it, and passes it written whole', () => {
    // On 2026-10-03 the pass read only a path reaching `.md` on its line: eleven pointers wrapped onto the next comment
    // line (at a hyphen or at the slash) and two abbreviated with `…` were never read, so a move of their note would
    // have stranded them. Every one must now be written whole, on one line.
    mkdirSync(join(root, 'packages', 'ui', 'src'), { recursive: true });
    const file = join(root, 'packages', 'ui', 'src', 'row.tsx');
    const wrapped = [
      `// at a hyphen (\`${note('fixed', 'a-note-that-is-')}`,
      '// gone.md`), at the slash (`' + note('fixed', ''),
      `// a-note.md\`), abbreviated (${note('fixed', 'a-no-…')}) and (${note('…-note.md')}).`,
      '',
    ].join('\n');
    writeFileSync(file, wrapped);
    expect(checkCodeFile(root, file).map((p: { line: number; target: string }) => [p.line, p.target])).toEqual([
      [1, note('fixed', 'a-note-that-is-')],
      [2, note('fixed', '')],
      [3, note('fixed', 'a-no-…')],
      [3, note('…-note.md')],
    ]);
    writeFileSync(file, `// at a hyphen (\`${note('fixed', 'a-note.md')}\`) and written whole.\n`);
    expect(checkCodeFile(root, file)).toEqual([]);
  });

  it('leaves a directory named as a directory and a placeholder that names no note', () => {
    const text = [
      `moved to \`${note('fixed', '')}\`, recorded in ${note('')}.`,
      `a \`${note('….md')}\` path, a \`${note('…')}\` path, ${note('*.md')}, (\`a-note\`, ${note('fixed', '')})`,
      '',
    ].join('\n');
    expect(partialDefectPaths(text)).toEqual([]);
  });
});

/*
 * The third pass: a defect-note path written as inline code in the record's prose. Fourteen such paths outside the request
 * log named notes at paths they no longer had on 2026-10-03, and neither earlier pass read one; six of them are history
 * kept on purpose, which a mark on their own line now keeps explicitly.
 */
describe("check-record-links — a defect-note path in the record's prose must name a note, or be marked as history", () => {
  type Problem = { line: number; target: string; reason: string };
  const brief = (problems: Problem[]) => problems.map((p) => [p.line, p.target, p.reason]);
  const mark = (...paths: string[]) => `<!-- historical-path: ${paths.join(' ')} -->`;

  it('fails a path in a sentence or a link\'s text at its pre-fixed/ path, naming file, line and path, and passes it once it follows the note', () => {
    const file = join(root, 'docs', 'architecture', 'adr.md');
    writeFileSync(file, ['# ADR', '', `Recorded as \`${note('a-note.md')}\`, which carries the repair.`, `See [\`${note('a-note.md')}\`](../defects/fixed/a-note.md).`, ''].join('\n'));
    expect(checkProseFile(root, file)).toEqual([
      { file, line: 3, text: 'defect note', target: note('a-note.md'), reason: 'no note at this path' },
      { file, line: 4, text: 'defect note', target: note('a-note.md'), reason: 'no note at this path' },
    ]);
    writeFileSync(file, ['# ADR', '', `Recorded as \`${note('fixed', 'a-note.md')}\`, which carries the repair.`, `See [\`${note('fixed', 'a-note.md')}\`](../defects/fixed/a-note.md).`, ''].join('\n'));
    expect(checkProseFile(root, file)).toEqual([]);
  });

  it('keeps a path a mark on its own line names, and only that one: not the same path on another line, nor another path beside it', () => {
    const file = join(root, 'docs', 'defects', 'fixed', 'b-note.md');
    writeFileSync(file, [
      `When written, it cited \`${note('a-note.md')}\` and \`${note('gone.md')}\`. ${mark(note('a-note.md'))}`,
      `~~Not built: \`${note('gone.md')}\`.~~ ${mark(note('gone.md'), note('other.md'))}`,
      `And again \`${note('a-note.md')}\`.`,
      '',
    ].join('\n'));
    expect(brief(checkProseFile(root, file))).toEqual([
      [1, note('gone.md'), 'no note at this path'],
      [2, note('other.md'), 'the mark names no path written as inline code on its line'],
      [3, note('a-note.md'), 'no note at this path'],
    ]);
  });

  it('fails a mark on a live path, which would hide the pointer from the pass when its note next moved', () => {
    const file = join(root, 'docs', 'architecture', 'adr.md');
    writeFileSync(file, `Now at \`${note('fixed', 'a-note.md')}\`. ${mark(note('fixed', 'a-note.md'))}\n`);
    expect(brief(checkProseFile(root, file))).toEqual([[1, note('fixed', 'a-note.md'), 'marked historical, but a note is at this path: a live pointer is checked, not kept']]);
  });

  it('skips fenced code, an HTML comment and a mark shown as inline code, and reads a code span that wraps a line at the line of the path', () => {
    const text = [
      '```',
      note('in-a-fence.md'),
      '```',
      `<!-- ${note('in-a-comment.md')} -->`,
      `The mark is written \`${mark(note('shown.md'))}\`.`,
      `A span that wraps \`the note`,
      `${note('wrapped.md')}\` here.`,
      '',
    ].join('\n');
    expect(prosePointers(text)).toEqual({ pointers: [{ line: 7, target: note('wrapped.md') }], marks: [] });
  });

  it('reads every record file but the request log, which it names with the reason', () => {
    mkdirSync(join(root, 'docs', 'product'), { recursive: true });
    writeFileSync(join(root, 'docs', 'product', 'requests.md'), `| R-001 | \`${note('a-note.md')}\` |\n`);
    writeFileSync(join(root, 'docs', 'architecture', 'adr.md'), `\`${note('a-note.md')}\` ${mark(note('a-note.md'))} and \`${note('fixed', 'a-note.md')}\`\n`);
    writeFileSync(join(root, 'AGENTS.md'), `\`${note('gone.md')}\`\n`);
    const { problems, pointers, kept } = checkProse(root);
    expect([brief(problems), pointers, kept]).toEqual([[[1, note('gone.md'), 'no note at this path']], 3, 1]);
    expect(problems[0].file).toBe(join(root, 'AGENTS.md'));
    expect(PROSE_EXEMPT.get('docs/product/requests.md')).toMatch(/orchestrator's alone to edit/);
  });
});
