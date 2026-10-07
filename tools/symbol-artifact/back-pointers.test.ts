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
 *
 * Both directions are read (OQ-222, BP1, ruled under R-072): a labelled note whose requirement the register does not
 * record under that verb and directive, and a register entry with no such note at its requirement. Six notes once
 * named a directive whose disposition block left their requirement out, and REQ-TOOLS-069 and REQ-SHELL-119 sat in the
 * register with no note
 * (docs/defects/fixed/six-back-pointers-name-a-directive-whose-disposition-does-not-name-their-requirement.md). A note
 * that names a directive with no disposition for that requirement is a cross-reference in its own words and takes none
 * of the three labels (docs/product/README.md, "The back-pointer, in place").
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

const key = (p: BackPointer): string => `${p.requirement} ${p.verb} ${p.directive}`;

/** Every register entry, as "<requirement> <verb> <directive>", the converse side of the notes. */
function registerEntries(): string[] {
  return (Object.entries(REGISTER) as [Verb, Readonly<Record<string, string>>][]).flatMap(([verb, map]) =>
    Object.entries(map).map(([req, pd]) => `${req} ${verb} ${pd}`),
  );
}

describe('the back-pointers in docs/spec agree with the directive register', () => {
  it('reads the notes at all: hundreds of them, under every verb', () => {
    const all = backPointers();
    expect(all.length).toBeGreaterThan(200);
    for (const verb of ['Superseded', 'Narrowed', 'Extended'] as const) expect(all.some((p) => p.verb === verb)).toBe(true);
  });

  it("every note's verb is the register's disposition for its requirement", () => {
    expect(backPointers().filter((p) => !agrees(p)).map(key)).toEqual([]);
  });

  it('every register entry has its note at its requirement, with the same verb and directive', () => {
    const notes = new Set(backPointers().map(key));
    expect(registerEntries().filter((e) => !notes.has(e))).toEqual([]);
  });

  it('OQ-222 (BP1, R-072): the five reaches the six notes marked are in the register, and the introduction is no back-pointer', () => {
    expect(NARROWED_BY['REQ-SANDBOX-104' as keyof typeof NARROWED_BY]).toBe('PD-TOOLS-002');
    expect(NARROWED_BY['REQ-TOOLS-071' as keyof typeof NARROWED_BY]).toBe('PD-TOOLS-002');
    expect(NARROWED_BY['REQ-TOOLS-072' as keyof typeof NARROWED_BY]).toBe('PD-TOOLS-002');
    for (const req of ['REQ-MONITOR-173', 'REQ-WORKSPACE-041', 'REQ-LIBRARY-017', 'REQ-NOTIFY-251']) {
      expect(EXTENDED_BY[req as keyof typeof EXTENDED_BY]).toBe('PD-LIBRARY-002');
    }
    // REQ-WORKSPACE-041 keeps its narrowing beside the extension.
    expect(NARROWED_BY['REQ-WORKSPACE-041' as keyof typeof NARROWED_BY]).toBe('PD-WORKSPACE-002');
    expect(backPointers().filter((p) => p.requirement === null)).toEqual([]);
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
