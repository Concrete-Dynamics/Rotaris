/**
 * The back-pointer at a requirement says what the directive register says (docs/product/README.md, "The back-pointer,
 * in place": "Use `Superseded by`, `Narrowed by` or `Extended by` to match the disposition"). The register's disposition
 * blocks become SUPERSEDED_BY, NARROWED_BY and EXTENDED_BY in the generated artifact, which is what code reads; the
 * note in docs/spec/ is what a reader of the specification reads. Two sides of one fact, written by hand in two files,
 * so this reads both.
 *
 * Acceptance finding F15: PD-ORCH-014 listed REQ-CONFIG-135 under Extends and its note read "Extended by", where OQ-53's
 * ruling narrows the requirement's "session's event stream" to the timeline
 * (docs/defects/fixed/pd-orch-014-records-req-config-135-as-extended-where-oq-53-narrows-it.md).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EXTENDED_BY, NARROWED_BY, SUPERSEDED_BY } from '@rotaris/kernel';

const repo = join(import.meta.dirname, '..', '..');
const specDir = join(repo, 'docs', 'spec');

type Verb = 'Superseded' | 'Narrowed' | 'Extended';
const REGISTER: Record<Verb, Readonly<Record<string, string>>> = {
  Superseded: SUPERSEDED_BY,
  Narrowed: NARROWED_BY,
  Extended: EXTENDED_BY,
};

/** A requirement's definition, in the generator's three shapes (tools/symbol-artifact/generate.mjs). */
const DEFINITION = [/^-\s+\*\*(REQ-[A-Z]+-\d+)\*\*/, /^\*\*(REQ-[A-Z]+-\d+)\*\*\s*[—:]/, /^#{2,5}\s+(REQ-[A-Z]+-\d+)/];
const BACK_POINTER = /\*\*(Superseded|Narrowed|Extended) by \[`(PD-[A-Z]+-\d+)`\]/g;

interface BackPointer {
  readonly where: string;
  /** The requirement whose definition the note follows, or null above the file's first one. */
  readonly requirement: string | null;
  readonly verb: Verb;
  readonly directive: string;
}

function backPointers(): BackPointer[] {
  const found: BackPointer[] = [];
  for (const file of readdirSync(specDir).filter((f) => /^\d\d-.*\.md$/.test(f)).sort()) {
    let requirement: string | null = null;
    readFileSync(join(specDir, file), 'utf8')
      .split(/\r?\n/)
      .forEach((line, i) => {
        for (const shape of DEFINITION) {
          const m = shape.exec(line);
          if (m) {
            requirement = m[1] ?? null;
            break;
          }
        }
        for (const m of line.matchAll(BACK_POINTER)) {
          found.push({ where: `${file}:${i + 1}`, requirement, verb: m[1] as Verb, directive: m[2] ?? '' });
        }
      });
  }
  return found;
}

const agrees = (p: BackPointer): boolean => p.requirement !== null && REGISTER[p.verb][p.requirement] === p.directive;

/**
 * Notes that name a directive whose disposition block does not name their requirement, recorded and not repaired here:
 * docs/defects/six-back-pointers-name-a-directive-whose-disposition-does-not-name-their-requirement.md. An entry leaves
 * this list when its note or its directive is repaired, and the test below fails until it does.
 */
const KNOWN_DISAGREEING = [
  'REQ-MONITOR-173 Extended PD-LIBRARY-002',
  'REQ-SANDBOX-104 Narrowed PD-TOOLS-002',
  'REQ-WORKSPACE-041 Extended PD-LIBRARY-002',
  'null Extended PD-LIBRARY-002',
  'REQ-LIBRARY-017 Extended PD-LIBRARY-002',
  'REQ-NOTIFY-251 Extended PD-LIBRARY-002',
];
const key = (p: BackPointer): string => `${p.requirement} ${p.verb} ${p.directive}`;

describe('the back-pointers in docs/spec agree with the directive register', () => {
  it('reads the notes at all: hundreds of them, under every verb', () => {
    const all = backPointers();
    expect(all.length).toBeGreaterThan(200);
    for (const verb of ['Superseded', 'Narrowed', 'Extended'] as const) expect(all.some((p) => p.verb === verb)).toBe(true);
  });

  it("every note's verb is the register's disposition for its requirement, the recorded six aside", () => {
    const disagreeing = backPointers().filter((p) => !agrees(p));
    expect(disagreeing.map(key).sort()).toEqual([...KNOWN_DISAGREEING].sort());
  });

  it('F15 (PD-ORCH-014, OQ-53): REQ-CONFIG-135 is narrowed by PD-ORCH-014, not extended, and its note says so', () => {
    expect(NARROWED_BY['REQ-CONFIG-135' as keyof typeof NARROWED_BY]).toBe('PD-ORCH-014');
    expect(EXTENDED_BY['REQ-CONFIG-135' as keyof typeof EXTENDED_BY]).toBeUndefined();
    const notes = backPointers().filter((p) => p.requirement === 'REQ-CONFIG-135');
    expect(notes.map((p) => `${p.verb} ${p.directive}`)).toEqual(['Narrowed PD-ORCH-014']);
    // The directive keeps extending the two whose text it leaves whole.
    expect(EXTENDED_BY['REQ-ORCH-139' as keyof typeof EXTENDED_BY]).toBe('PD-ORCH-014');
    expect(EXTENDED_BY['REQ-NOTIFY-268' as keyof typeof EXTENDED_BY]).toBe('PD-ORCH-014');
  });

  it('PD-ORCH-006 revision 3 (OQ-205 as ruled, R-072): REQ-ORCH-025 is narrowed by PD-ORCH-006 beside REQ-ORCH-029, and each note says so', () => {
    expect(NARROWED_BY['REQ-ORCH-025' as keyof typeof NARROWED_BY]).toBe('PD-ORCH-006');
    expect(NARROWED_BY['REQ-ORCH-029' as keyof typeof NARROWED_BY]).toBe('PD-ORCH-006');
    expect(backPointers().filter((p) => p.requirement === 'REQ-ORCH-025').map((p) => `${p.verb} ${p.directive}`)).toEqual(['Narrowed PD-ORCH-006']);
  });
});
