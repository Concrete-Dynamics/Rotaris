/** Domain 22 (PD-TRACE-001): the adoption strip's words (REQ-ADOPT-001, REQ-ADOPT-002, REQ-ADOPT-004, REQ-ADOPT-023). */
import { describe, expect, it } from 'vitest';
import type { AdoptionRecord, AdoptionView, DetectionResult } from '@rotaris/contracts';
import { adoptionSentence, deltaLines, outcomeSentence, RECORD_DESCRIPTION, RUN_DESCRIPTION } from './adoption-model.js';

const DETECTION: DetectionResult = { candidates: [], implRoots: [], testRoots: [], testFilePatterns: [], annotations: [], undecided: [{ code: 'no-store', detail: 'none' }], bounds: { files: 3, bytes: 10, reached: null } };
const RECORD: AdoptionRecord = {
  version: 1, recordedAt: '2026-10-29T12:00:00.000Z', how: 'run',
  adapter: { candidate: 'docs#FR#bullet', storeDir: 'docs', idPrefix: 'FR', extraction: { kind: 'definition-lines', pattern: '(FR-\\d+)' }, layout: {}, notes: '' },
  documents: [{ path: 'docs/a.md', contentHash: '0123456789abcdef', identifiers: ['FR-1'] }],
  requirements: [{ id: 'FR-1', document: 'docs/a.md', canonicalHash: '0123456789abcdef0123456789abcdef' }],
};
const EMPTY = { newIds: [], changedIds: [], removedIds: [], documentsAdded: [], documentsChanged: [], documentsRemoved: [] };

describe('the adoption strip', () => {
  it('states the three states in one sentence', () => {
    expect(adoptionSentence({ state: 'not-adopted', detection: DETECTION })).toBe('Not adopted. No candidate requirements store was found.');
    expect(adoptionSentence({ state: 'adopted', record: RECORD, delta: EMPTY, current: 1, skippedLines: 0 })).toBe('Adopted: FR requirements in docs, no change since 2026-10-29T12:00:00.000Z.');
    const changed: AdoptionView = { state: 'adopted', record: RECORD, delta: { ...EMPTY, newIds: ['FR-2', 'FR-3'], removedIds: ['FR-1'] }, current: 2, skippedLines: 0 };
    expect(adoptionSentence(changed)).toBe('Adopted: FR requirements in docs, 3 changes since 2026-10-29T12:00:00.000Z.');
  });

  it('lists new requirements first, then changed, then removed, capped at twenty', () => {
    const many = Array.from({ length: 23 }, (_, i) => `FR-${i + 10}`);
    expect(deltaLines({ ...EMPTY, removedIds: ['FR-1'], changedIds: ['FR-2'], newIds: many }).map((l) => `${l.kind}:${l.label}`)).toEqual(['new:New (23)', 'changed:Changed (1)', 'removed:Removed (1)']);
    expect(deltaLines({ ...EMPTY, newIds: many })[0]!.ids).toMatch(/and 3 more$/);
  });

  it('says which control consults a model', () => {
    expect(RUN_DESCRIPTION).toMatch(/Consults a model\.$/);
    expect(RECORD_DESCRIPTION).toMatch(/Consults no model\.$/);
  });

  it('reports the outcome or the refusal', () => {
    expect(outcomeSentence({ ok: true, record: RECORD, layoutFile: 'kept', progress: [] })).toBe('Recorded 1 FR requirement in 1 document from docs. rotaris-traceability.json already exists and was kept.');
    expect(outcomeSentence({ ok: false, reason: 'refused (candidate)', progress: [] })).toBe('refused (candidate)');
  });
});
