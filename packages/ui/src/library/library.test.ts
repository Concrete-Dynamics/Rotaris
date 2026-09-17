import { describe, expect, it } from 'vitest';
import type { ImprovementArtifactRecord, ImprovementProposal } from '@rotaris/contracts';
import {
  artifactCounts,
  proposalMatches,
  proposalRows,
  relativeCreatedLabel,
  rollbackLabel,
} from './ProposalsTab.js';

const proposal = (id: string, status: ImprovementProposal['status'], summary: string): ImprovementProposal => ({
  id,
  category: 'workspace_note',
  summary,
  evidence: [{ kind: 'other', text: 'Observed twice.', source_task_id: null, source_artifact_id: null, source_session_id: 'session-1' }],
  recommended_action: 'Record the observation.',
  risk: 'low',
  status,
  target_persona: null,
  proposed_verifier_section: null,
  created_at: '2026-09-14T10:00:00.000Z',
});

const record = (artifactId: string, proposals: readonly ImprovementProposal[]): ImprovementArtifactRecord => ({
  artifact: {
    artifact_id: artifactId,
    source_session_id: 'session-1',
    source_kind: 'post_run',
    source_run_type: 'task_run',
    generated_at: '2026-09-14T10:00:00.000Z',
    collector_model: 'analyst',
    proposals: [...proposals],
    considered_session_ids: [],
    notes: null,
    checkpoints: [],
    rolled_back_at: null,
  },
  versions_due: 2,
  versions_pruned: 0,
  versions_never_recorded: 0,
});

describe('Library proposal presentation', () => {
  it('flattens artifacts in stored proposal order and carries the optimistic version', () => {
    const rows = proposalRows([
      record('impart_00000001', [proposal('imp_00000001', 'pending_review', 'First'), proposal('imp_00000002', 'approved', 'Second')]),
      record('impart_00000002', [proposal('imp_00000003', 'deferred', 'Third')]),
    ]);
    expect(rows.map((row) => [row.artifactId, row.proposal.id, row.versionsDue])).toEqual([
      ['impart_00000001', 'imp_00000001', 2],
      ['impart_00000001', 'imp_00000002', 2],
      ['impart_00000002', 'imp_00000003', 2],
    ]);
  });

  it('matches the searchable proposal vocabulary and summarizes review states', () => {
    const row = proposalRows([record('impart_00000001', [proposal('imp_00000001', 'pending_review', 'Keep the release note')])])[0]!;
    expect(proposalMatches(row, 'release')).toBe(true);
    expect(proposalMatches(row, 'workspace_note')).toBe(true);
    expect(proposalMatches(row, 'pending')).toBe(true);
    expect(proposalMatches(row, 'missing')).toBe(false);
    expect(artifactCounts(record('impart_00000001', [
      proposal('imp_00000001', 'pending_review', 'First'),
      proposal('imp_00000002', 'approved', 'Second'),
      proposal('imp_00000003', 'approved', 'Third'),
    ]))).toBe('1 pending · 2 approved');
  });

  it('uses stable compact ages and reports rollback availability', () => {
    const now = Date.parse('2026-09-15T10:00:00.000Z');
    expect(relativeCreatedLabel('2026-09-15T09:59:45.000Z', now)).toBe('now');
    expect(relativeCreatedLabel('2026-09-15T09:20:00.000Z', now)).toBe('40m');
    expect(relativeCreatedLabel('2026-09-15T05:00:00.000Z', now)).toBe('5h');
    expect(relativeCreatedLabel('2026-09-14T10:00:00.000Z', now)).toBe('1d');
    expect(rollbackLabel(record('impart_00000001', []))).toBe('no rollback point');
  });
});
