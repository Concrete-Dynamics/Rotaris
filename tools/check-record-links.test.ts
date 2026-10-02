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
import { anchorsOf, checkFile, checkRecord, extractLinks, githubSlug, isRelative, withoutCode } from './check-record-links.mjs';

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
