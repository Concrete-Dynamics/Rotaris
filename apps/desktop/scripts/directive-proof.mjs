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

/** @param {string} body */
const withDirectives = (body) => writeFileSync(register, `${original}\n${body}\n`);

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
    assert('the artifact carries no directive yet', /export const DIRECTIVE_COUNT = 0;/.test(art));
    assert('the template inside the HTML comment is not parsed as a directive', !/'PD-CHAT-001':/.test(art));
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
    assert('NARROWED_BY maps the narrowed one', /NARROWED_BY = \{\n  'REQ-CHAT-006': 'PD-CHAT-001',/.test(art));
    assert('EXTENDED_BY maps the extended one', /EXTENDED_BY = \{\n  'REQ-SHELL-023': 'PD-CHAT-001',/.test(art));
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
    ['a directive stating no disposition at all', '### PD-CHAT-001 — x\n\nIt says nothing about what it reaches.\n', /states no disposition/],
    ['a disposition naming nothing', '### PD-CHAT-001 — x\n\n> **Supersedes:**\n', /names no requirement identifier/],
    ['the same identifier minted twice', '### PD-CHAT-001 — x\n\n> **New:** none.\n\n### PD-CHAT-001 — y\n\n> **New:** none.\n', /defined twice/],
    ['an identifier in a retired domain', '### PD-CLI-001 — x\n\n> **New:** none.\n', /retired domain/],
    ['a disposition with no directive above it', '> **Supersedes:** REQ-CHAT-004\n', /precedes any directive/],
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
} finally {
  writeFileSync(register, original);
  const restored = readFileSync(register, 'utf8') === original;
  const { ok } = generate();
  assert('the register is restored and the artifact regenerated from it', restored && ok);
}

console.log(`\n${ran - failures}/${ran} checks passed`);
if (failures > 0) process.exit(1);
