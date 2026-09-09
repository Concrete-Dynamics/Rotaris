import type { LayoutConfig, RequirementRecord, StoreParse, VerificationReport } from '@rotaris/contracts';

/**
 * The minimal `StoreParse` / `VerificationReport` fixture the Part AK tests and `delivery-proof` run against
 * until Part AJ's fixture store (`apps/desktop/scripts/fixtures/requirements-store/`) is merged: one epic, six
 * children (one deprecated, one technical and derived), the hashes shaped as REQ-TRACE-036/037 fix them. Not a
 * parser and not a store: the engine is faked around this value.
 */
export const FIXTURE_LAYOUT: LayoutConfig = Object.freeze({
  storeDir: 'docs/requirements', idPrefix: 'REQ', artifactPath: 'src/requirements.generated.ts',
  debtBaselinePath: '.rotaris/traceability/debt.json', orphanModuleBaselinePath: '.rotaris/traceability/orphans.json', orphanTestBaselinePath: '.rotaris/traceability/orphan-tests.json',
  retiredLogPath: 'docs/requirements/RETIRED.md', sourceRoots: ['src'], testRoots: ['test'], skip: [], annotationPatterns: [],
});

const hex = (seed: string, length: number): string => {
  let h = 2166136261;
  let out = '';
  for (let i = 0; out.length < length; i++) {
    h ^= seed.charCodeAt(i % seed.length) + i;
    h = Math.imul(h, 16777619) >>> 0;
    out += h.toString(16).padStart(8, '0');
  }
  return out.slice(0, length);
};

export function fixtureRecord(id: string, over: Partial<RequirementRecord> = {}): RequirementRecord {
  const number = Number(id.slice(id.lastIndexOf('-') + 1));
  return {
    id, number, status: 'approved', traceRequired: true, testRequired: true, title: `Requirement ${id}`, kind: 'product', derivedFrom: [],
    sourcePath: `docs/requirements/${id}.md`, contentHash: hex(`content:${id}`, 16), canonicalHash: hex(`canonical:${id}`, 32), prose: `The prose of ${id}.`, isEpic: number % 100 === 0,
    ...over,
  };
}

export function fixtureParse(root = 'D:\\fixture\\project'): StoreParse {
  const records: RequirementRecord[] = [
    fixtureRecord('REQ-100', { title: 'The epic', isEpic: true, traceRequired: false, testRequired: false }),
    fixtureRecord('REQ-101', { epic: 'REQ-100', priority: 'High' }),
    fixtureRecord('REQ-102', { epic: 'REQ-100', priority: 'Critical' }),
    fixtureRecord('REQ-103', { epic: 'REQ-100', status: 'draft' }),
    fixtureRecord('REQ-104', { epic: 'REQ-100', priority: 'Low', testRequired: false }),
    fixtureRecord('REQ-105', { epic: 'REQ-100', kind: 'technical', derivedFrom: ['REQ-101'] }),
    fixtureRecord('REQ-106', { epic: 'REQ-100', status: 'deprecated' }),
  ];
  return { root, layout: FIXTURE_LAYOUT, records, fingerprint: hex('fingerprint', 64), errors: [] };
}

export function fixtureReport(generation = 1): VerificationReport {
  return {
    generation,
    findings: [{ severity: 'error', code: 'missing-test', id: 'REQ-102', path: 'src/b.ts', line: 3, message: 'REQ-102 declares test: required and has no covering test.' }],
    statistics: { total: 7, approved: 5, traced: 3, testCovered: 1, debt: { trace: 2, test: 3, orphan: 0, orphanTest: 0 } },
    evidence: {
      'REQ-101': { implementationTrace: 'satisfied', coveringTest: 'satisfied', verification: 'satisfied', sites: [{ path: 'src/a.ts', line: 10, kind: 'implementation', ids: ['REQ-101'] }, { path: 'test/a.test.ts', line: 4, kind: 'test', ids: ['REQ-101'], testNode: 'test/a.test.ts::covers' }] },
      'REQ-102': { implementationTrace: 'satisfied', verification: 'failed', sites: [{ path: 'src/b.ts', line: 3, kind: 'implementation', ids: ['REQ-102'] }] },
      'REQ-104': { implementationTrace: 'stale', sites: [{ path: 'src/d.ts', line: 1, kind: 'implementation', ids: ['REQ-104'] }] },
    },
  };
}
