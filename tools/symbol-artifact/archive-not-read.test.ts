/* eslint-disable rotaris/requirement-citations-resolve -- a fixture specification of made-up identifiers (REQ-Y-…) */
/**
 * `pnpm symbols` reads `docs/spec/` and never `docs/archive/` (R-092, `tools/archive/spec.mjs`): the archive holds the
 * text of withdrawn and superseded requirements under headings that name their identifiers, and a generator that read it
 * would define an identifier twice or, for one defined nowhere else, invent it. The archive defines no identifier.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { REQ } from '@rotaris/kernel';
import { specFiles } from './definitions.mjs';

const REPO = join(import.meta.dirname, '..', '..');
const COPIED = ['tools/symbol-artifact/generate.mjs', 'tools/symbol-artifact/definitions.mjs', 'tools/symbol-artifact/replace.mjs', 'tools/record-parts.mjs'];

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'symbols-archive-'));
  const files: Record<string, string> = {
    'docs/product/directives.md': '# Product directives\n',
    'docs/spec/01-domain.md': '# Domain\n\n- **REQ-Y-001** — *Withdrawn.* Defined here.\n',
    'docs/spec/01-domain/01-part.md': '# Domain — part\n\n- **REQ-Y-002** — Defined in a part.\n',
    'docs/archive/spec/01-domain.md': '# Archived — Domain\n\n<a id="req-y-001"></a>\n\n### REQ-Y-001\n\nIts archived text.\n',
    'docs/archive/spec/01-domain/01-part.md': '# Archived — part\n\n### REQ-Y-003\n\n- **REQ-Y-004** — Text in the archive only.\n',
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  for (const file of COPIED) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    copyFileSync(join(REPO, file), join(root, file));
  }
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('pnpm symbols never reads docs/archive/', () => {
  it('lists the domain files and their parts under docs/spec/, and nothing of the archive', () => {
    expect(specFiles(join(root, 'docs', 'spec'))).toEqual(['01-domain.md', '01-domain/01-part.md']);
  });

  it('writes an artifact that defines what docs/spec/ defines, and no identifier only the archive names', () => {
    execFileSync(process.execPath, [join(root, 'tools', 'symbol-artifact', 'generate.mjs')], { env: { ...process.env, SYMBOLS_QUIET: '1' } });
    const artifact = readFileSync(join(root, 'packages', 'kernel', 'src', 'generated', 'requirements.ts'), 'utf8');
    expect([...artifact.matchAll(/^ {2}'(REQ-[A-Z]+-\d+)': \{/gm)].map((m) => m[1])).toEqual(['REQ-Y-001', 'REQ-Y-002']);
    expect(artifact).toContain("'REQ-Y-001': { id: 'REQ-Y-001', domain: 'Y', file: '01-domain.md', line: 3, withdrawn: true }");
    expect(artifact).not.toContain('archive');
  });

  it('the repository\'s own artifact names no file outside the specification\'s domain files', () => {
    const files = new Set(specFiles(join(REPO, 'docs', 'spec')));
    expect(Object.values(REQ).filter((s) => !files.has(s.file))).toEqual([]);
  });
});
