/**
 * `bundle.mjs`'s `uv python install` writes nothing outside the tree
 * (`docs/defects/fixed/the-bundle-steps-python-install-tries-to-place-an-interpreter-on-the-users-path.md`; ADR-0035). A
 * static scan, as `lib/launch-sites.test.ts` holds the proofs' launches: `bundle.mjs` runs at import, and running the step
 * would download an interpreter.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));

/** The argument lists of every `run(uv, [...])` in the text, each as its top-level elements' source text, comments left out. */
function uvCalls(text: string): string[][] {
  return [...text.matchAll(/\brun\(\s*uv\s*,\s*\[/g)].map((m) => {
    const out: string[] = [];
    let depth = 0;
    let element = '';
    for (let i = m.index! + m[0].length; i < text.length; i += 1) {
      const c = text[i]!;
      if (c === '/' && (text[i + 1] === '/' || text[i + 1] === '*')) {
        const end = text.indexOf(text[i + 1] === '/' ? '\n' : '*/', i + 2);
        if (end === -1) break;
        i = text[i + 1] === '/' ? end : end + 1;
        continue;
      }
      if (c === "'" || c === '"' || c === '`') {
        const from = i;
        for (i += 1; i < text.length && text[i] !== c; i += 1) if (text[i] === '\\') i += 1;
        element += text.slice(from, i + 1);
        continue;
      }
      if ('([{'.includes(c)) depth += 1;
      else if (')]}'.includes(c) && depth > 0) depth -= 1;
      else if (c === ']' || (c === ',' && depth === 0)) {
        if (element.trim() !== '') out.push(element.trim());
        if (c === ']') return out;
        element = '';
        continue;
      }
      element += c;
    }
    throw new Error(`no end to the argument list at ${m.index}`);
  });
}

describe('uvCalls — the scan the assertions below read through', () => {
  it("is not thrown by a quote in a comment, and does not take a comment's text for an argument", () => {
    const text = "run(uv, ['a', // don't\n 'b' /* it's, ] */, 'c'], {});";
    expect(uvCalls(text)).toEqual([["'a'", "'b'", "'c'"]]);
  });
  it('keeps a nested expression as one element', () => {
    expect(uvCalls("run(uv, ['a', ...xs.map((x) => [x, ',']), 'b']);")).toEqual([["'a'", "...xs.map((x) => [x, ','])", "'b'"]]);
  });
});

// docs/defects/fixed/the-bundle-steps-python-install-tries-to-place-an-interpreter-on-the-users-path.md: `--install-dir`
// moves where uv keeps the interpreter, not its executable links, so without `--no-bin` the step also wrote a
// `python3.13` into the user's `~/.local/bin`, on PATH, outside the tree — on the Linux host one was left dangling once
// its worktree was removed (2026-10-31). `--no-registry` keeps the same call from registering the interpreter in the
// Windows registry, an entry that outlives the install directory the same way.
describe("bundle.mjs's interpreter install — nothing onto the user's PATH or into the registry", () => {
  const calls = uvCalls(readFileSync(join(HERE, 'bundle.mjs'), 'utf8'));
  const installs = calls.filter((args) => args[0] === "'python'" && args[1] === "'install'");
  it('finds the one `uv python install` the bundle runs, into the tree by --install-dir', () => {
    expect(calls.length).toBeGreaterThan(1);
    expect(installs).toHaveLength(1);
    expect(installs[0]).toContain("'--install-dir'");
  });
  it('passes --no-bin on that same call, so uv installs no executable into its bin directory', () => {
    expect(installs[0]).toContain("'--no-bin'");
  });
  it('passes --no-registry on that same call, so uv registers nothing in the Windows registry', () => {
    expect(installs[0]).toContain("'--no-registry'");
  });
});
