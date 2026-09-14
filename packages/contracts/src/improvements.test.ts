import { describe, expect, it } from 'vitest';
import { IMPROVEMENT_CATEGORIES, ImprovementArtifactSchema, RUN_TYPES, parseImprovementArtifact } from './improvements.js';

const proposal = {
  id: 'imp_00000001',
  category: 'workspace_note',
  summary: 'Keep the useful observation.',
  evidence: [{ kind: 'other', text: 'The run repeated the same lookup.', source_task_id: null, source_artifact_id: null, source_session_id: null }],
  recommended_action: 'Record the lookup result once.',
  created_at: '2026-09-14T10:00:00.000Z',
};

describe('improvement contracts', () => {
  it('closes the category and persisted run-type vocabularies', () => {
    expect(IMPROVEMENT_CATEGORIES).toHaveLength(10);
    expect(RUN_TYPES).toEqual(['task_run', 'improvement_run', 'integration_run']);
  });

  it('accepts the legacy session alias and fills compatible defaults', () => {
    const artifact = ImprovementArtifactSchema.parse({
      artifact_id: 'impart_00000001',
      session_id: 'session-1',
      generated_at: '2026-09-14T10:00:00.000Z',
      proposals: [proposal],
      considered_session_ids: ['a', 'a', 'b'],
    });
    expect(artifact.source_session_id).toBe('session-1');
    expect(artifact.source_run_type).toBe('task_run');
    expect(artifact.considered_session_ids).toEqual(['a', 'b']);
    expect(artifact.proposals[0]).toMatchObject({ risk: 'low', status: 'pending_review', target_persona: null });
  });

  it('rejects malformed proposal requirements with the contract prefix', () => {
    expect(() => parseImprovementArtifact({
      artifact_id: 'impart_00000001', source_session_id: 's', generated_at: '2026-09-14T10:00:00.000Z',
      proposals: [{ ...proposal, evidence: [] }], considered_session_ids: [],
    })).toThrow(/^malformed improvement artifact: /);
    expect(() => parseImprovementArtifact({
      artifact_id: 'impart_00000001', source_session_id: 's', generated_at: '2026-09-14T10:00:00.000Z',
      proposals: [{ ...proposal, category: 'persona_memory_update' }], considered_session_ids: [],
    })).toThrow(/target_persona/);
  });
});
