import { FieldReader, sectionMap, type ProblemSink } from './field.js';

/**
 * `checkpoints:` (REQ-GIT-070..072, REQ-CONFIG-159..161): `enabled` three-valued — unset means on for a
 * worktree-isolated session and off elsewhere, `true` everywhere, a written `false` off even when isolated
 * (REQ-GIT-044); `max_per_session` the per-session retention limit REQ-GIT-049 applies, rejected at load below 1
 * or when not an integer (REQ-GIT-071: the load fails as a whole, nothing that depends on it starts);
 * `include_untracked` default true. A bare `checkpoints:` loads as the defaults (REQ-GIT-070).
 */
export interface CheckpointsSection {
  readonly enabled: boolean | null;
  readonly max_per_session: number;
  readonly include_untracked: boolean;
}

export const CHECKPOINTS_DEFAULTS: CheckpointsSection = { enabled: null, max_per_session: 50, include_untracked: true };
export const CHECKPOINTS_KEYS = Object.keys(CHECKPOINTS_DEFAULTS) as readonly (keyof CheckpointsSection)[];

export function readCheckpointsSection(value: unknown, sink: ProblemSink): CheckpointsSection {
  const r = new FieldReader(sectionMap(value, 'checkpoints', sink), 'checkpoints', sink);
  r.warnUnknown(CHECKPOINTS_KEYS);
  const d = CHECKPOINTS_DEFAULTS;
  return {
    enabled: r.boolOrNull('enabled'),
    max_per_session: r.int('max_per_session', d.max_per_session, { min: 1 }),
    include_untracked: r.bool('include_untracked', d.include_untracked),
  };
}

/** REQ-GIT-044: the three-valued key against the session's binding. */
export function checkpointsEnabledFor(section: Pick<CheckpointsSection, 'enabled'>, isolated: boolean): boolean {
  return section.enabled === null ? isolated : section.enabled;
}
