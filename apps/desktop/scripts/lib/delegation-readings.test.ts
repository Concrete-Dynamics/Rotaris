/**
 * The live run's `delegation` scenario's readers, pinned against the shapes the product records (item N57 of the 2026-10-13
 * survey). A reader that stopped matching its record would turn its check into "not asked" over a green run.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — the readers are plain ESM beside the script that uses them.
import { DIRECT_WORK_STATEMENT, HANDOFF_ARTIFACT_CAP, SWARM_HEADING, attachReading, handoffArtifact, delegatesToReading, followUpReading, handoffReading, requestOf, swarmReading } from './delegation-readings.mjs';

const body = (system: string, user: string, tools: { name: string; description?: string }[]) => ({
  requestBody: JSON.stringify({ model: 'm', messages: [{ role: 'system', content: system }, { role: 'user', content: [{ type: 'text', text: user }] }], tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description ?? t.name, parameters: {} } })) }),
});

describe('requestOf', () => {
  it('reads the system text, the first user message (string or parts) and each tool\'s name and description', () => {
    const r = requestOf(body('You are the orchestrator.', 'the task', [{ name: 'delegate', description: 'Delegate a task.' }]));
    expect(r).toEqual({ system: 'You are the orchestrator.', firstUser: 'the task', tools: [{ name: 'delegate', description: 'Delegate a task.' }] });
    expect(requestOf({ requestBody: 'not json' })).toBeNull();
  });
});

describe('swarmReading (PD-ORCH-006 revision 3, REQ-ORCH-025)', () => {
  it('a coordinating swarm run carries the layer, no direct-work statement, delegate and no writing tool', () => {
    const ok = swarmReading(requestOf(body(`You are the orchestrator.\n${SWARM_HEADING}\n…`, 'go', [{ name: 'read_file' }, { name: 'delegate' }])));
    expect(ok).toMatchObject({ kind: 'coordinating', faults: [] });
    const wrong = swarmReading(requestOf(body('You are the orchestrator.', 'go', [{ name: 'delegate' }, { name: 'terminal' }])));
    expect(wrong.kind).toBe('coordinating');
    expect(wrong.faults).toEqual(['the coordinating swarm run carries no swarm layer', 'the coordination-only set offered terminal']);
  });

  it('a granted swarm run carries the direct-work statement, no layer, and the writing tools beside delegate', () => {
    const ok = swarmReading(requestOf(body(`x ${DIRECT_WORK_STATEMENT} y`, 'go', [{ name: 'write_file' }, { name: 'terminal' }, { name: 'delegate' }])));
    expect(ok).toMatchObject({ kind: 'granted', faults: [] });
    const both = swarmReading(requestOf(body(`${DIRECT_WORK_STATEMENT}\n${SWARM_HEADING}`, 'go', [{ name: 'delegate' }])));
    expect(both.faults).toContain('the granted run carries the swarm layer beside the direct-work statement');
    expect(swarmReading(null).kind).toBe('absent');
  });
});

describe('delegatesToReading (OQ-229)', () => {
  const narrowed = 'The personas you can delegate to …: codebase-analyst (reads workspace files); docs-writer (reads and writes workspace files). Your delegates_to (codebase-analyst, docs-writer) narrows this list: a delegation to any other persona is refused.';
  const known = ['codebase-analyst', 'docs-writer', 'coding-agent', 'tester'];
  it('reads a narrowed catalogue, and a delegation outside the list refused naming it', () => {
    const r = delegatesToReading([requestOf(body('s', 'u', [{ name: 'delegate', description: narrowed }]))], ['codebase-analyst', 'docs-writer'], [
      { args: { persona: 'coding-agent' }, result: "Task 'x': rejected — 'coding-agent' is not a persona orchestrator may delegate to: its delegates_to lists codebase-analyst, docs-writer.", status: 'failed' },
    ], known);
    expect(r).toMatchObject({ kind: 'narrowed', named: [], outside: 1, admittedOutside: 0 });
  });

  it('fails a catalogue that names a persona outside the list, and counts one admitted outside it', () => {
    const r = delegatesToReading([requestOf(body('s', 'u', [{ name: 'delegate', description: `${narrowed} coding-agent (writes)` }]))], ['codebase-analyst', 'docs-writer'], [{ args: { persona: 'tester' }, result: "Task 't': queued", status: 'ok' }], known);
    expect(r).toMatchObject({ kind: 'wide', named: ['coding-agent'], admittedOutside: 1 });
    expect(delegatesToReading([requestOf(body('s', 'u', []))], ['x'], [], known).kind).toBe('not-offered');
  });
});

describe('followUpReading (PD-TOOLS-006 revision 3, PD-ORCH-005 clause 22)', () => {
  const said = "Task 'exports': queued — Following up exports (codebase-analyst): it resumes from its record under its own task id, with this task as its next message, and reports again when it ends.";
  const children = [{ task_id: 'bg_0000aaaa', canonical_name: 'exports', state: 'succeeded' }];
  const resumed = [{ name: 'child_resumed', metadata: { task_id: 'bg_0000aaaa', follow_up: true } }];
  it('credits an accepted follow-up that kept the child and left its timeline entry', () => {
    const r = followUpReading([{ ordinal: 9, args: { session_id: 'bg_0000aaaa' }, result: said, status: 'ok' }], children, resumed);
    expect(r).toMatchObject({ kind: 'followed', accepted: [9], faults: [] });
  });

  it('names a follow-up with no timeline entry or a second child row, lists refusals, and reads none as not asked', () => {
    const r = followUpReading([{ ordinal: 9, args: { session_id: 'bg_0000aaaa' }, result: said, status: 'ok' }], [...children, { task_id: 'bg_0000bbbb', canonical_name: 'exports', state: 'succeeded' }], []);
    expect(r.faults).toEqual(['#9: exports has more than one child row', '#9: no child_resumed entry says bg_0000aaaa was followed up']);
    const refused = followUpReading([{ ordinal: 4, args: { session_id: 'bg_ffffffff' }, result: "Task 'x': rejected — session_id 'bg_ffffffff' names no settled child of yours: none of your children has that task id.", status: 'failed' }], children, resumed);
    expect(refused.kind).toBe('refused');
    expect(refused.refused[0]?.reason).toMatch(/names no settled child of yours/);
    expect(followUpReading([{ ordinal: 1, args: { persona: 'x' }, result: '', status: 'ok' }], children, resumed).kind).toBe('not-asked');
  });
});

describe('attachReading (PD-TOOLS-006 revision 5)', () => {
  const children = [{ task_id: 'bg_0000cccc', canonical_name: 'exports-doc' }];
  it('credits an attachment given whole that the context_selection entry agrees with', () => {
    const r = attachReading([{ ordinal: 7, status: 'ok', args: { task_name: 'exports-doc', attach_artifacts: ['art_AAAAAAAA'] }, result: "Task 'exports-doc': queued\n1 attached artifact will be given to the child whole." }], [{ task_id: 'bg_0000cccc', attached_included: 1 }], children);
    expect(r).toMatchObject({ kind: 'attached', given: 1, faults: [] });
  });

  it('names a disagreement, reads an unresolved reference as a NOTE, and none as not asked', () => {
    const r = attachReading([{ ordinal: 7, status: 'ok', args: { task_name: 'exports-doc', attach_artifacts: ['art_AAAAAAAA'] }, result: '1 attached artifact will be given to the child whole.' }], [{ task_id: 'bg_0000cccc', attached_included: 0 }], children);
    expect(r.faults).toEqual(['#7: the observation gave 1 whole, the entry 0']);
    expect(attachReading([{ ordinal: 2, status: 'ok', args: { task_name: 'x', attach_artifacts: ['nothing'] }, result: 'No attached artifact will be given to the child. 1 attachment could not be resolved: nothing.' }], [], children).kind).toBe('unresolved');
    expect(attachReading([{ ordinal: 2, status: 'ok', args: { task_name: 'x' }, result: '' }], [], children).kind).toBe('not-asked');
  });

  /*
   * L3 of the acceptance round at 3c3f447 (pack 2026-10-14T15-58-45-917Z, session 8de7ccb2): #10 was rejected for naming no todo
   * item, #11 (the same task_name) was admitted with "1 attached artifact will be given to the child whole", and the one child's
   * context_selection entry read attached_included 1. A rejected delegation queues no child, so it has no entry to agree with.
   */
  it('reads only the admitted delegations, never a rejection paired with the child its admitted retry made', () => {
    const attach = { task_name: 'exports-doc', attach_artifacts: ['art_URyDbLA9'], persona: 'docs-writer' };
    const rejected = { ordinal: 10, status: 'failed', args: attach, result: "Task 'exports-doc': rejected — This delegation names no todo item, and you keep a todo list for this task" };
    const admitted = { ordinal: 11, status: 'ok', args: attach, result: "Task 'exports-doc': queued — Accepted; the child runs in the foreground. 1 attached artifact will be given to the child whole." };
    const r = attachReading([rejected, admitted], [{ task_id: 'bg_0000cccc', attached_included: 1 }], children);
    expect(r).toMatchObject({ kind: 'attached', asked: 1, given: 1, rejected: 1, faults: [] });
  });

  it('reads a run whose every attaching delegation was rejected as rejected, not as a disagreement', () => {
    const r = attachReading([{ ordinal: 10, status: 'failed', args: { task_name: 'exports-doc', attach_artifacts: ['art_URyDbLA9'] }, result: "Task 'exports-doc': rejected — …" }], [], children);
    expect(r).toMatchObject({ kind: 'rejected', asked: 0, given: 0, rejected: 1, faults: [] });
  });
});

describe('handoffReading (REQ-SESSION-115, PD-LIBRARY-003 (e))', () => {
  it('reads a marker past the product\'s cut as cut, not absent, and reads the block only up to the next section', () => {
    const head = 'Artifact: art_AbCdEfGh — r (child_report, completed, edited)\n';
    const long = `${head}${'x'.repeat(HANDOFF_ARTIFACT_CAP - head.length - 3)}...\nTodo:\n- (empty)`;
    expect(handoffReading(long, 'art_AbCdEfGh', 'M')).toMatchObject({ kind: 'carried', carriesMarker: false, cutBeforeMarker: true });
    // A marker in a later section of the handoff is not the artifact's.
    expect(handoffReading(`${head}body\nTodo:\n- M`, 'art_AbCdEfGh', 'M')).toMatchObject({ carriesMarker: false, cutBeforeMarker: false });
  });
  it('credits the edited artifact marked edited, carrying the person\'s text and no frontmatter', () => {
    const user = 'Continue.\nArtifact: art_AbCdEfGh — exports-doc report (child_report, completed, edited)\n# exports-doc report\n\nLIVE-EDIT-MARKER\nTodo: …';
    expect(handoffReading(user, 'art_AbCdEfGh', 'LIVE-EDIT-MARKER')).toMatchObject({ kind: 'carried', carriesMarker: true, frontmatter: false });
  });

  it('fails an unedited header, notes another artifact, and reads nothing as absent', () => {
    expect(handoffReading('Artifact: art_AbCdEfGh — r (child_report, completed)\nbody', 'art_AbCdEfGh', 'M').kind).toBe('unedited');
    expect(handoffReading('Artifact: art_Zzzzzzzz — r (child_report, completed)', 'art_AbCdEfGh', 'M').kind).toBe('other-artifact');
    expect(handoffReading('', 'art_AbCdEfGh', 'M').kind).toBe('absent');
    expect(handoffReading('Artifact: art_AbCdEfGh — r (child_report, completed, edited)\n---\nid: "art_AbCdEfGh"\n---\nM', 'art_AbCdEfGh', 'M').frontmatter).toBe(true);
  });
});

describe('handoffArtifact (latestArtifactText\'s choice, REQ-SESSION-115)', () => {
  const a = (id: string, conversation_id: string | null, superseded_by: string | null = null) => ({ id, conversation_id, superseded_by });
  const iterations = [{ opened_at: '2026-10-13T10:00:00.000Z', root_task_id: 'bg_root0001' }];
  it('prefers the last artifact the latest iteration\'s root published over a later child\'s', () => {
    const rows = [a('art_root', 'bg_root0001'), a('art_child', 'bg_child001')];
    expect(handoffArtifact(rows, iterations, [])?.id).toBe('art_root');
  });
  it('takes the last unsuperseded artifact when the root published none, or a plan cycle opened after the iteration', () => {
    expect(handoffArtifact([a('art_1', 'bg_child001'), a('art_2', 'bg_child002'), a('art_3', 'bg_child003', 'art_4')], iterations, [])?.id).toBe('art_2');
    expect(handoffArtifact([a('art_root', 'bg_root0001'), a('art_child', 'bg_child001')], iterations, [{ opened_at: '2026-10-13T11:00:00.000Z' }])?.id).toBe('art_child');
    expect(handoffArtifact([], iterations, [])).toBeNull();
  });
});
