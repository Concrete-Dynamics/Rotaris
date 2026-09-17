import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_CONTEXT_CAPACITY, RUN_AGENT_ID, type AgentRecord, type SessionRecord, type TranscriptRow } from '@rotaris/contracts';
import { PersonaWindow } from './PersonaWindow.js';
import { WorkspaceView } from './WorkspaceView.js';
import { RowList, type Acknowledger } from './TranscriptSurface.js';
import type { DisplayRow } from './transcript/Row.js';
import { CAP_DEFAULTS, projectDisplay } from './transcript/project.js';
import { Button as DesignButton } from './design-system/index.js';

/**
 * **Verification only** (Part AA's `pnpm rows-proof`, the `rows-proof` renderer role). The ONE row renderer
 * mounted over a fixture array in the real product, in **both** of its surfaces at once — the Workspace
 * transcript and the persona window — so "the persona window draws the same row the Workspace does" is a
 * comparison of two live DOM subtrees rather than an assertion about imports.
 *
 * It exists because Part AA is built in parallel with Part Z, which owns the projection that would otherwise
 * produce these `DisplayRow`s; the plan's seam says so explicitly ("until the merge it mounts that component in
 * its own proof harness over a fixture array"). Nothing in the product reaches this file: main loads it only
 * under `ROTARIS_CAPTURE_PNG` with `ROTARIS_ROWS_PROOF=1`.
 */

/**
 * REQ-CHAT-056's dialect, in one body: the five treatments, a table, a heading, a task list, a thematic break,
 * an authored link, a **bare** URL, raw HTML that must appear as text, and **two image references — one remote,
 * one naming a location on this machine — neither of which may cause anything to be fetched or read.**
 */
export const ROW_PROOF_MARKDOWN = [
  '# The rendered body',
  '',
  'A paragraph with **bold**, *italic*, `inline code`, ~~struck~~ text and',
  'an authored [link to the specification](https://rows-proof.invalid/spec) plus a bare',
  'https://rows-proof.invalid/bare-one. (Trailing punctuation is excluded.)',
  '',
  '```ts',
  'const fenced = "code block";',
  '```',
  '',
  '| column | meaning |',
  '| --- | ---: |',
  '| one | first |',
  '| two | second |',
  '',
  '- [x] a finished step',
  '- [ ] an unfinished one',
  '',
  '> a quoted line',
  '',
  '---',
  '',
  '<script>window.__rowsProofHtmlExecuted = true;</script>',
  '',
  '![a remote picture](https://rows-proof.invalid/remote-image.png)',
  '',
  '![a local picture](file:///C:/rows-proof/local-image.png)',
  '',
].join('\n');

/** The needle every image reference in the fixture carries, so the main process can look for it in its request log. */
export const ROW_PROOF_IMAGE_NEEDLE = 'rows-proof.invalid/remote-image.png';

/**
 * The **positive control** for the network assertion. REQ-CHAT-056's "no image is ever loaded" is only measurable if
 * the observer that saw nothing would have seen something: this one subresource, requested deliberately by the
 * harness through the page's ordinary loader — the same path an `<img>` would take — proves main's `webRequest`
 * observer sees this window's subresource traffic, so the two image URLs' absence from the same log is a measurement
 * rather than a silence.
 *
 * It is a **same-origin** reference and nothing leaves the machine. A remote one cannot be the control: the renderer's
 * content-security policy is `connect-src 'none'` and `img-src 'self' data:` (ADR-0056), so a remote request is
 * stopped before the network layer and never reaches the observer at all. That policy is a second, independent bar to
 * a remote image, and it is **not** what makes REQ-CHAT-056 hold — what makes it hold is that the renderer emits no
 * image element and no request for one, which the `img` count and this log measure directly.
 */
export const ROW_PROOF_CONTROL_URL = './rows-proof-control-probe.css';

const AT = '2026-09-07T09:00:00.000Z';
const at = (n: number) => new Date(Date.parse(AT) + n * 1000).toISOString();
const stamp = (n: number) => {
  const d = new Date(Date.parse(AT) + n * 1000);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
const row = (index: number, over: Partial<TranscriptRow>): TranscriptRow => ({ index, kind: 'agent', settled: true, body: '', at: at(index), ts: stamp(index), ...over });

/**
 * The fixture, one row per thing the proof reads. Two consecutive `helper` tool rows follow one another so
 * REQ-CHAT-057's continuation rule has something to draw, and the reader can see the persona bar.
 */
export function rowProofRows(): readonly TranscriptRow[] {
  return [
    row(0, { kind: 'user', body: 'Render every treatment the dialect fixes, and open no image.\nSee https://rows-proof.invalid/from-a-user-row too.' }),
    row(1, { kind: 'agent', persona: 'orchestrator', name: 'orchestrator', body: ROW_PROOF_MARKDOWN }),
    row(2, { kind: 'thinking', persona: 'orchestrator', name: 'orchestrator', body: 'A reasoning body that stays hidden until the preference or a click asks for it.', startedAt: at(2), durationMs: 4_000 }),
    row(3, { kind: 'tool', persona: 'coding-agent', name: 'helper', body: '✓ read_file README.md', toolName: 'read_file', toolStatus: 'ok', callKey: 'call-ok', durationMs: 3_200, startedAt: at(3), input: '{ "path": "README.md" }', output: 'line one of the untruncated output\nline two\nline three' }),
    // The four outcome rows are measured one at a time, which is what the Workspace surface below asks the
    // projection for by passing `groupTools={false}`.
    //
    // **The falsified reason, kept beside its replacement.** They carried FOUR DIFFERENT families on purpose —
    // reading, searching, running, editing — because REQ-CHAT-064 ended a run at a change of family, so four
    // families meant four rows. PD-CHAT-004 bounds a run by the AGENT instead, and all four belong to `helper`:
    // under the directive they fold into one activity line and no outcome can be read on a row of its own. The
    // family spread is no longer what keeps them apart, and picking four more families would not have helped.
    // The fold itself is measured on the `proof-groups` and `proof-activity` surfaces, which exist for it.
    row(4, { kind: 'tool', persona: 'coding-agent', name: 'helper', body: 'grep MISSING.md', toolName: 'grep', toolStatus: 'failed', callKey: 'call-failed', durationMs: 120, startedAt: at(4), input: '{ "path": "MISSING.md" }', output: 'no such file' }),
    row(5, { kind: 'tool', persona: 'coding-agent', name: 'helper', body: 'terminal rm -rf build', toolName: 'terminal', toolStatus: 'blocked', callKey: 'call-blocked', durationMs: 0, startedAt: at(5), input: '{ "command": "rm -rf build" }', blockedReason: 'a recursive delete is denied by the starter rules' }),
    row(6, { kind: 'tool', persona: 'coding-agent', name: 'helper', body: 'write_file NOTES.md', toolName: 'write_file', toolStatus: 'running', settled: false, callKey: 'call-running', startedAt: at(6), output: 'On branch main' }),
    row(7, { kind: 'diff', body: 'NOTES.md [Edited] +2 -1\n[1]+ a changed line' }),
    row(8, { kind: 'system', body: 'A system notice, which renders as text and never as Markdown: **not bold**.' }),
    row(9, { kind: 'agent', persona: 'coding-agent', name: 'helper', body: 'The child agent answers, still streaming…', settled: false }),
    // The SAME body the orchestrator's row carries, authored by the child — so both surfaces draw one, and "the
    // persona window draws the same row the Workspace does" is a comparison rather than an assertion about imports.
    row(10, { kind: 'agent', persona: 'coding-agent', name: 'helper', body: ROW_PROOF_MARKDOWN }),
  ];
}

const AGENT: AgentRecord = {
  id: 'child-1', name: 'helper', givenName: 'helper', persona: 'coding-agent', state: 'running', presentationState: 'running',
  parentId: RUN_AGENT_ID, dependencies: ['bg_0000beef'], activity: 'reading the repository', model: 'scripted', depth: 1, background: true,
  category: 'implementation', spawnedAt: AT, completedAt: null, toolCalls: 4,
  delegationTask: 'TASK: read the repository and report what the transcript renderer must draw, at length enough that the collapsed summary has to compact it to one hundred and ten characters with an ellipsis where it is cut.',
  reasoning: 'high', contextUsed: 1_200, contextLimit: DEFAULT_CONTEXT_CAPACITY, grantedTools: ['read_file', 'terminal'], calledTools: ['read_file', 'terminal'], activeTools: ['terminal'],
  delegationSessionId: null, inheritedContext: 'The parent asked for the transcript rendering rules.', live: true, grantedMcp: {}, mcpServers: [], compressions: 0,
};

export function rowProofSession(): SessionRecord {
  return {
    id: 'rows-proof-session', executionStatus: 'running', workspaceRoot: 'C:/rows-proof', createdAt: AT, updatedAt: at(10),
    historyOpen: true, truncation: { truncated: false, droppedCount: 0, cap: null, lastTrimAt: null },
    agents: [AGENT], pendingQuestions: [], tokenUsage: { input: 120, output: 80 }, cost: '0', stopReason: null, runType: 'task_run', improvementArtifactIds: [], runStartedAt: AT,
    iterationsCompleted: 1, summary: null, permissionMode: 'guided', sandboxed: false,
    pendingApprovals: [{ request_id: 'req-1', session_id: 'rows-proof-session', agent_id: 'helper', persona: 'coding-agent', tool_name: 'terminal', command: 'git push origin main', argument_summary: '', rule_id: 'starter.push', reason: 'a push leaves the machine', sequence: 1 }],
    backgroundSessions: 0, intent: null, queuedPrompts: [], todo: null, childTodos: {}, messageLimit: null, pausedAtCount: null, planGate: null, planReleased: false,
    usageHistory: [], costLabel: { text: 'cost unknown', qualifier: 'unknown' },
    toolCalls: { total: 4, agents: 1, byTool: [{ tool: 'read_file', count: 2 }, { tool: 'terminal', count: 2 }] },
    worktreeBranch: null, wait: null, compression: null, entryContext: { used: 12_000, limit: DEFAULT_CONTEXT_CAPACITY },
  };
}

/**
 * REQ-CHAT-064/065: a folded group of four `read_file` calls — three ok, one failed — plus a question trailer.
 * Both are categories with **no persisted row**, so Part Z's step 4 is what produces them in the product; the
 * harness builds them directly, which is what lets Part AA draw and measure them before that step exists.
 */
export function rowProofDisplays(): readonly DisplayRow[] {
  const members: TranscriptRow[] = [0, 1, 2, 3].map((i) => row(20 + i, {
    kind: 'tool', persona: 'coding-agent', name: 'helper', body: `read_file file-${i}.ts`, toolName: 'read_file',
    toolStatus: i === 3 ? 'failed' : 'ok', callKey: `group-call-${i}`, durationMs: 250 * (i + 1), startedAt: at(20 + i),
    input: `{ "path": "file-${i}.ts" }`, output: `MEMBER-OUTPUT-${i} must never appear in the group's copy or description`,
  }));
  return [
    {
      // One family, no reasoning — PD-CHAT-004's degenerate case, whose summary is REQ-CHAT-065's own
      // example unchanged. The mixed run the directive is for is the `proof-activity` surface below.
      shape: 'group', key: 'group-call-0', family: 'reading', members,
      segments: [{ label: 'reading', reasoning: false, members: 4, counts: { ok: 3, failed: 1, blocked: 0, running: 0 }, durationMs: 2_500, tokens: 0 }],
      role: 'coding-agent', persona: 'coding-agent',
      counts: { ok: 3, failed: 1, blocked: 0, running: 0 }, durationMs: 2_500, startedAt: at(20), endedAt: at(23),
      inFlight: null, inFlightLabel: null,
      blob: members.map((m) => m.output ?? '').join('\n').slice(0, 2_000),
    },
    { shape: 'trailer', key: 'question:q-1', trailer: { sort: 'question', requestId: 'q-1', role: 'helper', steps: 3, text: '3 steps — Choose a branch' } },
    { shape: 'trailer', key: 'question:q-2', trailer: { sort: 'question', requestId: 'q-2', role: 'helper', steps: 1, text: '1 step — Confirm the target' } },
  ];
}

/**
 * PD-CHAT-004's fixture: the sequence the owner reported — one agent thinking and reading in turn — plus a
 * second agent's run beside it, and a live third run. It is projected through the **real** `projectDisplay`
 * rather than written out as `DisplayRow` literals, so what the proof measures is step 4's own output and
 * not a hand-built stand-in for it.
 */
export function activityProofRows(): readonly TranscriptRow[] {
  const think = (i: number, chars: number, ms: number) => row(30 + i, { kind: 'thinking', persona: 'orchestrator', name: 'orchestrator', body: `deliberation ${i}`, chars, durationMs: ms, startedAt: at(30 + i), settled: true });
  const call = (i: number, toolName: string, over: Partial<TranscriptRow> = {}) => row(30 + i, {
    kind: 'tool', persona: 'orchestrator', name: 'orchestrator', body: `${toolName} file-${i}.ts`, toolName,
    toolStatus: 'ok', callKey: `activity-${i}`, durationMs: 120, startedAt: at(30 + i), input: `{ "path": "file-${i}.ts" }`,
    output: `ACTIVITY-OUTPUT-${i} must never appear in the line's copy or description`, ...over,
  });
  return [
    think(0, 2216, 16_000), call(1, 'read_file'), call(2, 'glob'),
    think(3, 132, 1_000), call(4, 'read_file'), call(5, 'list_dir'),
    call(6, 'grep', { toolStatus: 'failed' }),
    // A message ends the run; the second agent's run follows and must be a line of its own.
    row(37, { kind: 'agent', persona: 'orchestrator', name: 'orchestrator', body: 'The ladder has four rungs.' }),
    row(38, { kind: 'thinking', persona: 'coding-agent', name: 'helper', body: 'the child deliberates', chars: 400, durationMs: 3_000, startedAt: at(38), settled: true }),
    row(39, { kind: 'tool', persona: 'coding-agent', name: 'helper', body: 'bash pnpm test', toolName: 'bash', toolStatus: 'running', settled: false, callKey: 'activity-live', startedAt: at(39), output: 'running the suite' }),
  ];
}

/**
 * PD-CHAT-004 revision 2 and PD-CHAT-005's fixture: **the screenshot of 2026-09-16**. Two agents working at
 * once, their rows alternating in the record exactly as the owner read them — the orchestrator thinking and
 * reading while the analyst it delegated to thinks and searches. Under revision 1 these ten rows drew as five
 * lines of two, each re-stating a timestamp and a role; under revision 2 they are one line per agent.
 */
export function interleaveProofRows(): readonly TranscriptRow[] {
  interface Who { readonly persona: string; readonly name: string }
  const parent: Who = { persona: 'orchestrator', name: 'orchestrator' };
  const child: Who = { persona: 'codebase-analyst', name: 'analyst' };
  const think = (i: number, who: Who, chars: number, ms: number) =>
    row(60 + i, { kind: 'thinking', ...who, body: `deliberation ${i}`, chars, durationMs: ms, startedAt: at(60 + i), settled: true });
  const call = (i: number, who: Who, toolName: string, over: Partial<TranscriptRow> = {}) => row(60 + i, {
    kind: 'tool', ...who, body: `${toolName} file-${i}.ts`, toolName, toolStatus: 'ok', callKey: `weave-${i}`,
    durationMs: 120, startedAt: at(60 + i), input: `{ "path": "file-${i}.ts" }`, output: `weave output ${i}`, ...over,
  });
  return [
    row(59, { kind: 'user', body: 'Implement spec-0015.', name: undefined, persona: undefined }),
    think(0, parent, 880, 4_000), call(1, parent, 'read_file'),
    think(2, child, 640, 3_000), call(3, child, 'grep'),
    think(4, parent, 320, 2_000), call(5, parent, 'glob'),
    think(6, child, 410, 2_000), call(7, child, 'codebase_search'),
    call(8, parent, 'read_file'), call(9, child, 'grep', { toolStatus: 'running', settled: false }),
  ];
}

export function interleaveProofDisplays(): readonly DisplayRow[] {
  return projectDisplay({
    rows: interleaveProofRows(), running: true, groupTools: true, showReasoning: false, caps: CAP_DEFAULTS,
    expanded: new Set(), pendingQuestions: [], pendingApprovals: [],
  });
}

export function activityProofDisplays(expanded: ReadonlySet<string>): readonly DisplayRow[] {
  return projectDisplay({
    rows: activityProofRows(), running: true, groupTools: true, showReasoning: false, caps: CAP_DEFAULTS,
    expanded, pendingQuestions: [], pendingApprovals: [],
  });
}

export interface RowProofProps {
  readonly onOpenLink: (href: string) => void;
  readonly onAcknowledge: Acknowledger;
}

const REFUSED = { ok: false as const, reason: 'The proof harness runs no session.' };

export function RowProof({ onOpenLink, onAcknowledge }: RowProofProps) {
  const rows = useMemo(() => rowProofRows(), []);
  const session = useMemo(() => rowProofSession(), []);
  const groups = useMemo(() => rowProofDisplays(), []);
  // The positive control for the network measurement (see ROW_PROOF_CONTROL_URL): one subresource through the page's
  // own loader, requested once. It resolves to nothing, which is immaterial — what matters is that main saw it asked for.
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = ROW_PROOF_CONTROL_URL;
    document.head.append(link);
    return () => link.remove();
  }, []);
  const [showReasoning, setShowReasoning] = useState(false);
  const [autoCollapseTools, setAutoCollapseTools] = useState(false);
  const shared = { showReasoning, autoCollapseTools, onOpenLink, onAcknowledge } as const;
  return (
    <div className="rows-proof" data-testid="rows-proof">
      <div className="rows-proof__controls">
        <DesignButton type="button" className="btn btn-ghost btn-compact" data-testid="proof-show-reasoning" aria-pressed={showReasoning} onClick={() => setShowReasoning((v) => !v)}>display/showReasoning: {showReasoning ? 'on' : 'off'}</DesignButton>
        <DesignButton type="button" className="btn btn-ghost btn-compact" data-testid="proof-auto-collapse" aria-pressed={autoCollapseTools} onClick={() => setAutoCollapseTools((v) => !v)}>display/autoCollapseTools: {autoCollapseTools ? 'on' : 'off'}</DesignButton>
      </div>
      <div className="rows-proof__surface" data-testid="proof-workspace">
        <WorkspaceView
          session={session} rows={rows} nowIso={at(12)}
          onSubmit={async () => REFUSED} onStop={async () => REFUSED}
          entry={{ persona: 'orchestrator', model: 'scripted', reasoning: 'high', tools: [] }}
          groupTools={false}
          {...shared}
        />
      </div>
      <div className="rows-proof__surface" data-testid="proof-persona">
        <PersonaWindow
          persona="coding-agent" session={session} rows={rows} runLevel={null} declaredTools={['read_file', 'terminal']}
          selectedAgentId="child-1" onSelectTab={() => undefined} nowIso={at(12)} compressionThresholdPercent={60}
          onSteer={async () => REFUSED} onCancel={async () => REFUSED}
          {...shared}
        />
      </div>
      <div className="rows-proof__surface transcript" data-testid="proof-groups">
        <RowList
          rows={[]} displays={groups} label="Folded groups and question trailers" acknowledge={onAcknowledge}
          surface={{ showReasoning, autoCollapseTools, runActive: true, nowMs: Date.parse(at(30)), openLink: onOpenLink }}
        />
      </div>
      {/* PD-CHAT-004: the same run twice, so the collapsed line's text and the rule beneath the expanded one are
          two live DOM subtrees the proof reads rather than two runs it has to sequence. The second is opened by a
          CLICK (`ROTARIS_CAPTURE_CLICKS`) and not by a seeded set: `RowList` owns its own expansion state, exactly
          as the product's pane does, and seeding the projection alone would draw member rows no `Row` revealed. */}
      <div className="rows-proof__surface transcript" data-testid="proof-activity">
        <RowList
          rows={[]} displays={activityProofDisplays(new Set())} label="Activity lines, collapsed" acknowledge={onAcknowledge}
          surface={{ showReasoning: false, autoCollapseTools: false, runActive: true, nowMs: Date.parse(at(45)), openLink: onOpenLink }}
        />
      </div>
      <div className="rows-proof__surface transcript" data-testid="proof-activity-open">
        <RowList
          rows={[]} displays={activityProofDisplays(new Set())} label="Activity line, expanded" acknowledge={onAcknowledge}
          surface={{ showReasoning: false, autoCollapseTools: false, runActive: true, nowMs: Date.parse(at(45)), openLink: onOpenLink }}
        />
      </div>
      {/* PD-CHAT-004 rev. 2 / PD-CHAT-005: two agents working at once. The depth resolver is the delegation
          tree's, which the Workspace view supplies from `session.agents`; here it is the fixture's own. */}
      <div className="rows-proof__surface transcript" data-testid="proof-interleave">
        <RowList
          rows={[]} displays={interleaveProofDisplays()} label="Two agents at once" acknowledge={onAcknowledge}
          surface={{
            showReasoning: false, autoCollapseTools: false, runActive: true, nowMs: Date.parse(at(75)), openLink: onOpenLink,
            agentDepth: (name) => (name === 'analyst' ? 1 : 0),
          }}
        />
      </div>
    </div>
  );
}
