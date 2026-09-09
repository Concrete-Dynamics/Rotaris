// Fixture test: coverage annotations in both forms, and a transitional comment whose first token resolves
// through the legacy alias table and whose second resolves to nothing (REQ-TRACE-070/071).
import { covers } from 'rotaris-traceability';
import { Requirement } from '../src/requirement_ids';

@covers(Requirement.REQ_101)
export function testTraced(): void {}

covers(Requirement.REQ_102, Requirement.REQ_105);
export function testPlainCall(): void {}

// covers: LEGACY-201, UNKNOWN-9
export function testLegacy(): void {}
