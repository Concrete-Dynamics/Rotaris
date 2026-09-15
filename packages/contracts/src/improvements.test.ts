import { describe, expect, it } from 'vitest';
import { IMPROVEMENT_CATEGORIES, ImprovementArtifactSchema, ImprovementProposalSchema, RUN_TYPES, VerifierSectionSchema, parseImprovementArtifact } from './improvements.js';

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

describe('REQ-LIBRARY verifier proposal contract', () => {
  it('accepts the shared verifier shape and applies bounded defaults', () => {
    expect(VerifierSectionSchema.parse({ checks: [{ name: 'suite', command: 'pnpm test', role: 'test' }] })).toEqual({
      checks: [{ name: 'suite', command: 'pnpm test', role: 'test', timeout: 600, severity: 'blocking' }],
    });
  });

  it.each([
    [{ checks: [{ name: '', command: 'pnpm test' }] }, 'name'],
    [{ checks: [{ name: 'suite', command: '' }] }, 'command'],
    [{ checks: [{ name: 'suite', command: 'pnpm test', cwd: '../outside' }] }, 'cwd'],
    [{ checks: [{ name: 'suite', command: 'pnpm test', failure_pattern: '[' }] }, 'failure_pattern'],
    [{ checks: [{ name: 'suite', command: 'a' }, { name: 'suite', command: 'b' }] }, 'duplicate check name'],
  ])('rejects an unsafe verifier block containing %s', (value, message) => {
    const parsed = VerifierSectionSchema.safeParse(value);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.message).toContain(message);
  });

  it('validates gate proposals through the same verifier schema', () => {
    const parsed = ImprovementProposalSchema.safeParse({
      id: 'imp_00000001', category: 'verifier_gate_update', summary: 'Run the suite.',
      evidence: [{ kind: 'analyst', text: 'The suite is the acceptance boundary.', source_task_id: null, source_artifact_id: null, source_session_id: null }],
      recommended_action: 'Add the suite.', risk: 'low', status: 'approved', target_persona: null,
      proposed_verifier_section: { checks: [{ name: 'suite', command: 'pnpm test', cwd: '..' }] },
      created_at: '2026-09-15T10:00:00.000Z',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.message).toContain('workspace-relative');
  });
});
