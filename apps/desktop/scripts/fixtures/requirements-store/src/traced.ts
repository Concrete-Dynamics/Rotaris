// Fixture source: the built-in convention's two forms — decorator position and a plain call — over the
// generated enum's members (REQ-TRACE-076/078).
import { traces } from 'rotaris-traceability';
import { Requirement } from './requirement_ids';

@traces(Requirement.REQ_101)
export class TracedService {
  run(): number { return 101; }
}

traces(
  Requirement.REQ_103,
  Requirement.REQ_105,
);
export const traced = true;
