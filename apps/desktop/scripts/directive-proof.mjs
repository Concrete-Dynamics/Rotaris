// @ts-check
// Proof for the product-directive layer (docs/product/README.md).
//
// The layer's claim is that a directive's precedence over a requirement is machine-checked
// rather than asserted in prose. This runs the symbol generator against directives written
// for the purpose and asserts both halves: that a well-formed directive reaches the corpus,
// and that each way of writing a broken one is refused. Every positive case is paired with
// the counterfactual that would have passed if the check were absent, because a check that
// has never refused anything is indistinguishable from no check.
//
// The register is edited in place and restored in a finally block; the last act is to
// re-run the generator so the committed artifact matches the committed register.

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const register = join(repo, 'docs', 'product', 'directives.md');
const generator = join(repo, 'tools', 'symbol-artifact', 'generate.mjs');
const artifact = join(repo, 'packages', 'kernel', 'src', 'generated', 'requirements.ts');

const original = readFileSync(register, 'utf8');
let failures = 0;
let ran = 0;

/**
 * Write a register holding ONLY the fixture.
 *
 * Found on the first execution of this register with entries in it (2026-09-12, PD-SHELL-001 and
 * PD-WORKSPACE-001): this used to APPEND the fixture to the committed file, which was sound only
 * while that file held no directive. With real entries above it, every exact assertion below became
 * order- and count-dependent — `DIRECTIVE_COUNT = 1` and a map anchored at its first line are claims
 * about an empty register, not about the generator. Worse, the counterfactual for a disposition with
 * no directive above it could no longer arise at all: a committed directive was always above it, so
 * the generator was right to accept it and that check silently stopped refusing anything, which is
 * the one failure mode this whole file exists to prevent.
 *
 * Replacing rather than appending keeps every case exact however many directives the register grows
 * to hold. What the committed register itself claims is checked in section 1, against the artifact.
 *
 * @param {string} body
 */
const withDirectives = (body) =>
  writeFileSync(register, `# Product directives — replaced by directive-proof, restored in its finally block\n\n${body}\n`);

/** Run the generator, returning its exit status and combined output. */
const generate = () => {
  const r = spawnSync(process.execPath, [generator], { cwd: repo, encoding: 'utf8', env: { ...process.env, SYMBOLS_QUIET: '' } });
  return { ok: r.status === 0, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
};

/**
 * @param {string} name
 * @param {boolean} passed
 * @param {string} [detail]
 */
const assert = (name, passed, detail) => {
  ran += 1;
  if (passed) {
    console.log(`  PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail.trim().split('\n').slice(0, 4).join('\n        ')}` : ''}`);
  }
};

// A directive that is well formed in every respect. REQ-CHAT-004 and REQ-CHAT-006 are live
// requirements of domain 03; nothing here is committed, so the corpus is untouched.
const GOOD = `### PD-CHAT-001 — proof directive, not committed

The composer MUST do a thing this proof invents and then discards.

> **Supersedes:** REQ-CHAT-004
> **Narrows:** REQ-CHAT-006
> **Extends:** REQ-SHELL-023
`;

try {
  console.log('directive proof\n');

  console.log('1. the register as committed');
  {
    const { ok, out } = generate();
    assert('an empty register generates', ok, out);
    const art = readFileSync(artifact, 'utf8');
    assert('the artifact declares DIRECTIVE_COUNT', /export const DIRECTIVE_COUNT = \d+;/.test(art));
    // Not "the register is empty" — it is not, and will only grow. What matters is that the count is
    // not stale with respect to the symbols beside it, which is checkable without knowing either.
    const carried = [...art.matchAll(/^ {2}'(PD-[A-Z]+-\d+)': \{ id:/gm)].length;
    const declared = Number(/export const DIRECTIVE_COUNT = (\d+);/.exec(art)?.[1] ?? -1);
    assert(
      'DIRECTIVE_COUNT matches the directives the artifact carries',
      carried === declared,
      `${carried} PD symbols, DIRECTIVE_COUNT ${declared}`,
    );
    // Found on the first execution of this register with real PD-CHAT-001 entries in it (2026-09-14,
    // a defect note, removed once repaired): this used to assert that
    // 'PD-CHAT-001' appeared nowhere in the artifact — true while the only PD-CHAT-001 in existence
    // was the example inside the register's HTML comment, and unsatisfiable from the day the owner
    // minted a real PD-CHAT-001 (the composer's popover chips). What the comment promises is that
    // its content is SKIPPED, which is checkable exactly: the parse of the register with its
    // comments removed must be byte-identical to the parse of the register as committed.
    const artCommitted = art;
    const stripped = original.replace(/<!--[\s\S]*?-->/g, '');
    assert('the committed register carries an HTML-comment template', stripped !== original);
    writeFileSync(register, stripped);
    const strippedRun = generate();
    assert(
      "the template inside the HTML comment is not parsed as a directive — the parse is identical with the comment gone",
      strippedRun.ok && readFileSync(artifact, 'utf8') === artCommitted,
      strippedRun.ok ? 'the artifact changed when the comment was removed' : strippedRun.out,
    );
  }

  console.log('\n2. a well-formed directive reaches the corpus');
  {
    withDirectives(GOOD);
    const { ok, out } = generate();
    assert('it generates', ok, out);
    const art = readFileSync(artifact, 'utf8');
    assert('the directive is a typed symbol', /'PD-CHAT-001': \{ id: 'PD-CHAT-001'/.test(art), art.slice(0, 200));
    assert('DIRECTIVE_COUNT counts it', /export const DIRECTIVE_COUNT = 1;/.test(art));
    assert('SUPERSEDED_BY maps the requirement to it', /SUPERSEDED_BY = \{\n  'REQ-CHAT-004': 'PD-CHAT-001',/.test(art));
    // OQ-237: NARROWED_BY and EXTENDED_BY hold a list per requirement; SUPERSEDED_BY stays one directive.
    assert('NARROWED_BY maps the narrowed one', /NARROWED_BY = \{\n  'REQ-CHAT-006': \['PD-CHAT-001'\],/.test(art));
    assert('EXTENDED_BY maps the extended one', /EXTENDED_BY = \{\n  'REQ-SHELL-023': \['PD-CHAT-001'\],/.test(art));
    assert(
      'the superseded requirement is deprecated at its symbol',
      /@deprecated Superseded by PD-CHAT-001[^\n]*\n  'REQ-CHAT-004':/.test(art),
    );
    assert(
      'the narrowed requirement is annotated but NOT deprecated',
      /\/\*\* Narrowed by PD-CHAT-001[^\n]*\n  'REQ-CHAT-006':/.test(art) && !/@deprecated[^\n]*\n  'REQ-CHAT-006':/.test(art),
    );
    assert(
      'a requirement no directive names is annotated by neither',
      !/(@deprecated|Narrowed by|Extended by)[^\n]*\n  'REQ-CHAT-005':/.test(art),
    );
  }

  console.log('\n3. the counterfactuals — each refusal, and what it would have let through');
  /** @type {[string, string, RegExp][]} */
  const refusals = [
    [
      'a disposition naming a requirement that does not exist',
      '### PD-CHAT-001 — x\n\n> **Supersedes:** REQ-CHAT-9999\n',
      /does not define/,
    ],
    [
      'a disposition naming a requirement withdrawn in place',
      '### PD-CHAT-001 — x\n\n> **Supersedes:** REQ-CHAT-104\n',
      /withdrawn in place/,
    ],
    [
      'two directives claiming precedence over one requirement',
      '### PD-CHAT-001 — x\n\n> **Supersedes:** REQ-CHAT-004\n\n### PD-CHAT-002 — y\n\n> **Supersedes:** REQ-CHAT-004\n',
      /precedence must be unambiguous/,
    ],
    [
      'one requirement both superseded and narrowed',
      '### PD-CHAT-001 — x\n\n> **Supersedes:** REQ-CHAT-004\n\n### PD-CHAT-002 — y\n\n> **Narrows:** REQ-CHAT-004\n',
      /both superseded by .* and narrowed by/,
    ],
    // OQ-237 (GV1, R-072): Supersedes beside Extends contradicts itself as Supersedes beside Narrows does, and two
    // narrowings of one requirement must name each other. The passing forms are in section 5.
    [
      'one requirement both superseded and extended',
      '### PD-CHAT-001 — x\n\n> **Supersedes:** REQ-CHAT-004\n\n### PD-CHAT-002 — y\n\n> **Extends:** REQ-CHAT-004\n',
      /both superseded by .* and extended by/,
    ],
    [
      'two narrowings of one requirement, neither naming the other',
      '### PD-CHAT-001 — x\n\nOne case.\n\n> **Narrows:** REQ-CHAT-006\n\n### PD-CHAT-002 — y\n\nAnother case.\n\n> **Narrows:** REQ-CHAT-006\n',
      /REQ-CHAT-006 is narrowed by both PD-CHAT-001 and PD-CHAT-002, and neither entry names the other/,
    ],
    [
      'two narrowings where the second names only a longer identifier sharing the first one\'s prefix',
      '### PD-CHAT-001 — x\n\nOne case.\n\n> **Narrows:** REQ-CHAT-006\n\n### PD-CHAT-002 — y\n\nBeside PD-CHAT-0011, not the first.\n\n> **Narrows:** REQ-CHAT-006\n',
      /neither entry names the other/,
    ],
    ['a directive stating no disposition at all', '### PD-CHAT-001 — x\n\nIt says nothing about what it reaches.\n', /states no disposition/],
    ['a disposition naming nothing', '### PD-CHAT-001 — x\n\n> **Supersedes:**\n', /names no requirement identifier/],
    ['the same identifier minted twice', '### PD-CHAT-001 — x\n\n> **New:** none.\n\n### PD-CHAT-001 — y\n\n> **New:** none.\n', /defined twice/],
    ['an identifier in a retired domain', '### PD-CLI-001 — x\n\n> **New:** none.\n', /retired domain/],
    ['a disposition with no directive above it', '> **Supersedes:** REQ-CHAT-004\n', /precedes any directive/],
    // OQ-222 (BP1, R-072): PD-LIBRARY-002's `New:` line named REQ-LIBRARY-017 and stood beside its Extends, and the
    // generator dropped the identifier without a word, so the requirement's "Extended by" note had no register behind it.
    // Each passing form is in section 4.
    [
      'a New line naming a requirement',
      '### PD-CHAT-001 — x\n\n> **New:** no live requirement covers this; REQ-CHAT-004 forbids it.\n',
      /"New" disposition .* names REQ-CHAT-004/,
    ],
    [
      'a New line whose continuation names a requirement',
      '### PD-CHAT-001 — x\n\n> **New:** no live requirement covers this;\n> REQ-CHAT-004 forbids it.\n',
      /"New" disposition .* names REQ-CHAT-004/,
    ],
    [
      'New beside another disposition',
      '### PD-CHAT-001 — x\n\n> **Extends:** REQ-SHELL-023\n> **New:** no live requirement covers this.\n',
      /declares itself New beside another disposition/,
    ],
  ];
  for (const [name, body, expected] of refusals) {
    withDirectives(body);
    const { ok, out } = generate();
    assert(`refused: ${name}`, !ok && expected.test(out), ok ? 'the generator accepted it' : out);
  }

  console.log('\n4. New alone is legitimate');
  {
    withDirectives('### PD-CHAT-001 — x\n\n> **New:** no live requirement covers this.\n');
    const { ok, out } = generate();
    assert('a directive that displaces nothing generates', ok, out);
    const art = readFileSync(artifact, 'utf8');
    assert('it names no requirement', /'PD-CHAT-001': \{[^}]*supersedes: \[\], narrows: \[\], extends: \[\]/.test(art));
  }
  {
    // The passing forms of section 3's two New refusals (OQ-222): the reason written in words across a continuation
    // line, and the requirement the directive reaches named under Extends with no New beside it.
    withDirectives('### PD-CHAT-001 — x\n\n> **New:** no live requirement covers this;\n> the composer has no such control.\n');
    const words = generate();
    assert('a New line and its continuation in words alone generate', words.ok, words.out);
    withDirectives('### PD-CHAT-001 — x\n\n> **Extends:** REQ-SHELL-023, REQ-CHAT-004\n');
    const named = generate();
    assert('the reached requirement named under Extends instead generates', named.ok, named.out);
    assert(
      'and reaches the register',
      named.ok && /EXTENDED_BY = \{\n  'REQ-CHAT-004': \['PD-CHAT-001'\],/.test(readFileSync(artifact, 'utf8')),
    );
  }

  console.log('\n5. several directives on one requirement (OQ-237)');
  {
    // The passing form of section 3's unnamed pair: the later entry names the earlier, in either order of the register.
    withDirectives(
      '### PD-CHAT-001 — x\n\nOne case.\n\n> **Narrows:** REQ-CHAT-006\n\n### PD-CHAT-002 — y\n\nAnother case, disjoint from PD-CHAT-001\'s.\n\n> **Narrows:** REQ-CHAT-006\n',
    );
    const pair = generate();
    assert('two narrowings where the second names the first generate', pair.ok, pair.out);
    assert(
      'and both are in the requirement\'s list, sorted',
      pair.ok && /NARROWED_BY = \{\n  'REQ-CHAT-006': \['PD-CHAT-001', 'PD-CHAT-002'\],/.test(readFileSync(artifact, 'utf8')),
    );
    assert(
      'and the requirement\'s symbol names both',
      pair.ok && /\/\*\* Narrowed by PD-CHAT-001, PD-CHAT-002[^\n]*\n  'REQ-CHAT-006':/.test(readFileSync(artifact, 'utf8')),
    );
    withDirectives(
      '### PD-CHAT-001 — x\n\nOne case, disjoint from PD-CHAT-002\'s.\n\n> **Narrows:** REQ-CHAT-006\n\n### PD-CHAT-002 — y\n\nAnother case.\n\n> **Narrows:** REQ-CHAT-006\n',
    );
    const reversed = generate();
    assert('the same pair where the first names the second generates', reversed.ok, reversed.out);
    withDirectives('### PD-CHAT-001 — x\n\n> **Extends:** REQ-SHELL-023\n\n### PD-CHAT-002 — y\n\n> **Extends:** REQ-SHELL-023\n');
    const extensions = generate();
    assert('two extensions of one requirement, naming nothing, generate', extensions.ok, extensions.out);
    assert(
      'and both are in its list',
      extensions.ok && /EXTENDED_BY = \{\n  'REQ-SHELL-023': \['PD-CHAT-001', 'PD-CHAT-002'\],/.test(readFileSync(artifact, 'utf8')),
    );
    withDirectives('### PD-CHAT-001 — x\n\n> **Narrows:** REQ-CHAT-006\n\n### PD-CHAT-002 — y\n\n> **Extends:** REQ-CHAT-006\n');
    const both = generate();
    assert(
      'a narrowing and an extension of one requirement generate, and its symbol names each under its verb',
      both.ok && /\/\*\* Narrowed by PD-CHAT-001; extended by PD-CHAT-002[^\n]*\n  'REQ-CHAT-006':/.test(readFileSync(artifact, 'utf8')),
      both.out,
    );
  }
} finally {
  writeFileSync(register, original);
  const restored = readFileSync(register, 'utf8') === original;
  const { ok } = generate();
  assert('the register is restored and the artifact regenerated from it', restored && ok);
}

console.log(`\n${ran - failures}/${ran} checks passed`);
if (failures > 0) process.exit(1);
