// Fixture source: still references a deprecated requirement (REQ-TRACE-095 — a warning, never an error).
import { traces } from 'rotaris-traceability';
import { Requirement } from './requirement_ids';

@traces(Requirement.REQ_300)
export class DeprecatedUse {
  run(): number { return 300; }
}
