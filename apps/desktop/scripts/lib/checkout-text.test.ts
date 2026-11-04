/**
 * REQ-WORKSPACE-050: the text `injection-proof`'s isolated launch expects from a workspace instruction file read in the
 * run's worktree, against the bytes that exposed the defect: a worktree `AGENTS.md` checked out with CRLF under Git for
 * Windows' `core.autocrlf=true` (`docs/archive/defects/injection-proofs-isolated-launch-compares-a-crlf-checkout-with-the-committed-lf-text.md`).
 */
import { describe, expect, it } from 'vitest';
import { checkoutOf } from './checkout-text.mjs';

// The proof's own `body(id, copy)` and `blockOf(path, text)`, restated so the case reads the comparison it makes.
const body = (id: string, copy: string) => `# ${id}\nINJECTION-PROOF ${id} (${copy})\n`;
const blockOf = (path: string, text: string) => `<!-- source: ${path} -->\n${text.replace(/\n+$/, '')}`;
// The product's merge (`mergeInstructionContext`): the file's trailing newlines dropped, then the block.
const received = (path: string, raw: string) => `<!-- source: ${path} -->\n${raw.replace(/\n+$/, '')}`;

const committed = body('workspace:AGENTS.md', 'committed');
const path = 'C:\\scratch\\workspace\\.rotaris\\worktrees\\s1\\AGENTS.md';

describe('checkoutOf (REQ-WORKSPACE-050, injection-proof isolated)', () => {
  it('accepts a checkout that kept the committed LF text', () => {
    expect(checkoutOf(committed, committed)).toBe(committed);
  });

  it('accepts a CRLF checkout, and the block it yields is the one the model receives', () => {
    const crlf = '# workspace:AGENTS.md\r\nINJECTION-PROOF workspace:AGENTS.md (committed)\r\n';
    const expected = checkoutOf(committed, crlf);
    expect(expected).toBe(crlf);
    expect(received(path, crlf).includes(blockOf(path, expected!))).toBe(true);
    // The comparison the proof made before: the committed LF text, never found in what a CRLF checkout yields.
    expect(received(path, crlf).includes(blockOf(path, committed))).toBe(false);
  });

  it('refuses the base working copy, under either line ending', () => {
    const workingCopy = body('workspace:AGENTS.md', 'base working copy');
    expect(checkoutOf(committed, workingCopy)).toBeNull();
    expect(checkoutOf(committed, workingCopy.replace(/\n/g, '\r\n'))).toBeNull();
  });

  it('refuses a half-converted file and a file with stray carriage returns', () => {
    expect(checkoutOf(committed, '# workspace:AGENTS.md\r\nINJECTION-PROOF workspace:AGENTS.md (committed)\n')).toBeNull();
    expect(checkoutOf(committed, committed.replace(/\n/g, '\r\r\n'))).toBeNull();
    expect(checkoutOf(committed, '')).toBeNull();
  });
});
