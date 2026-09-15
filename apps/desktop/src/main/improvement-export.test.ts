import { describe, expect, it } from 'vitest';
import { ImprovementArtifactRecordSchema, RecordedImprovementVersionSchema } from '@rotaris/contracts';
import { buildImprovementExport } from './improvement-export.js';

const artifact = ImprovementArtifactRecordSchema.parse({
  artifact: {
    artifact_id: 'impart_Abc12345', source_session_id: 'session-1', source_run_type: 'task_run', generated_at: '2026-09-14T10:00:00.000Z', collector_model: 'medium', considered_session_ids: [], notes: null, checkpoints: [], rolled_back_at: null,
    proposals: [{ id: 'imp_Abc12345', category: 'workspace_note', summary: 'Keep this', evidence: [{ kind: 'run', text: 'Observed' }], recommended_action: 'Record it', risk: 'low', status: 'approved', target_persona: null, proposed_verifier_section: null, created_at: '2026-09-14T10:00:00.000Z' }],
  },
  versions_due: 4, versions_pruned: 1, versions_never_recorded: 1,
});

describe('improvement export (REQ-LIBRARY-176)', () => {
  it('keeps every artifact field and exports retained history in recorded order with separate gap counts', () => {
    const v2 = RecordedImprovementVersionSchema.parse({ version: 2, recorded_at: '2026-09-14T10:02:00.000Z', cause: 'status_change', artifact: artifact.artifact });
    const v1 = RecordedImprovementVersionSchema.parse({ version: 1, recorded_at: '2026-09-14T10:01:00.000Z', cause: 'collected', artifact: artifact.artifact });
    const document = buildImprovementExport([artifact], new Map([[artifact.artifact.artifact_id, { versions: [v2, v1], skipped: [3], versionsPruned: 1, versionsNeverRecorded: 1 }]]), '2026-09-14T11:00:00.000Z');
    expect(JSON.parse(JSON.stringify(document))).toEqual(document);
    expect(document.artifacts[0]!.artifact).toEqual(artifact.artifact);
    expect(document.artifacts[0]!.history_audit.retained_versions.map((version) => version.version)).toEqual([1, 2]);
    expect(document.artifacts[0]!.history_audit).toMatchObject({ versions_pruned: 1, versions_never_recorded: 1, unreadable_versions_skipped: [3] });
  });
});
