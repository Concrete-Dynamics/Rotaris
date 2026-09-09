/**
 * GENERATED requirement-symbol artifact. Do not edit by hand: every regeneration replaces this file whole.
 * Compiled from the requirement store at `docs/requirements` by the Rotaris traceability toolchain.
 * Regenerate with the requirements view’s "Regenerate requirement symbols" action (REQ-TRACE-509).
 */
/* eslint-disable */
// prettier-ignore
// rotaris-traceability-fingerprint: 0000000000000000000000000000000000000000000000000000000000000000
import { Lifecycle, RequirementMeta } from 'rotaris-traceability';

export enum Requirement {
  /** [approved: trace and coverage obligations apply as declared] Fixture epic - docs/requirements/REQ-100-fixture-epic.md */
  REQ_100 = 100,

  /** [approved: trace and coverage obligations apply as declared] Traced and covered - docs/requirements/REQ-100-fixture-epic/REQ-101-traced-and-covered.md */
  REQ_101 = 101,

  /** [approved: trace and coverage obligations apply as declared] Removed since this generation - docs/requirements/REQ-100-fixture-epic/REQ-107-removed.md */
  REQ_107 = 107,

}

export const DEPRECATED_REQUIREMENTS: ReadonlySet<Requirement> = new Set<Requirement>([]);

export const REQUIREMENT_METADATA: ReadonlyMap<number, RequirementMeta> = new Map<number, RequirementMeta>([
  [100, new RequirementMeta("REQ-100", 100, Lifecycle.Approved, "Fixture epic", "docs/requirements/REQ-100-fixture-epic.md", false, false, "0000000000000000", "product", [])],
  [101, new RequirementMeta("REQ-101", 101, Lifecycle.Approved, "Traced and covered", "docs/requirements/REQ-100-fixture-epic/REQ-101-traced-and-covered.md", true, true, "0000000000000000", "product", [])],
  [107, new RequirementMeta("REQ-107", 107, Lifecycle.Approved, "Removed since this generation", "docs/requirements/REQ-100-fixture-epic/REQ-107-removed.md", true, true, "0000000000000000", "product", [])],
]);
