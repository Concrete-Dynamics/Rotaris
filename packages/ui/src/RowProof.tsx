import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_CONTEXT_CAPACITY, RUN_AGENT_ID, type AgentRecord, type SessionRecord, type TranscriptRow } from '@rotaris/contracts';
import { PersonaWindow } from './PersonaWindow.js';
import { WorkspaceView } from './WorkspaceView.js';
import { RowList, type Acknowledger } from './TranscriptSurface.js';
import type { DisplayRow } from './transcript/Row.js';

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
    row(4, { kind: 'tool', persona: 'coding-agent', name: 'helper', body: 'read_file MISSING.md', toolName: 'read_file', toolStatus: 'failed', callKey: 'call-failed', durationMs: 120, startedAt: at(4), input: '{ "path": "MISSING.md" }', output: 'no such file' }),
    row(5, { kind: 'tool', persona: 'coding-agent', name: 'helper', body: 'terminal rm -rf build', toolName: 'terminal', toolStatus: 'blocked', callKey: 'call-blocked', durationMs: 0, startedAt: at(5), input: '{ "command": "rm -rf build" }', blockedReason: 'a recursive delete is denied by the starter rules' }),
    row(6, { kind: 'tool', persona: 'coding-agent', name: 'helper', body: 'terminal git status', toolName: 'terminal', toolStatus: 'running', settled: false, callKey: 'call-running', startedAt: at(6), output: 'On branch main' }),
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
  delegationSessionId: null, inheritedContext: 'The parent asked for the transcript rendering rules.', live: true, grantedMcp: {}, mcpServers: [],
};

export function rowProofSession(): SessionRecord {
  return {
    id: 'rows-proof-session', executionStatus: 'running', workspaceRoot: 'C:/rows-proof', createdAt: AT, updatedAt: at(10),
    historyOpen: true, truncation: { truncated: false, droppedCount: 0, cap: null, lastTrimAt: null },
    agents: [AGENT], pendingQuestions: [], tokenUsage: { input: 120, output: 80 }, cost: '0', stopReason: null, runStartedAt: AT,
    iterationsCompleted: 1, summary: null, permissionMode: 'guided', sandboxed: false,
    pendingApprovals: [{ request_id: 'req-1', session_id: 'rows-proof-session', agent_id: 'helper', persona: 'coding-agent', tool_name: 'terminal', command: 'git push origin main', argument_summary: '', rule_id: 'starter.push', reason: 'a push leaves the machine', sequence: 1 }],
    backgroundSessions: 0, intent: null, queuedPrompts: [], messageLimit: null, pausedAtCount: null,
    usageHistory: [], costLabel: { text: 'cost unknown', qualifier: 'unknown' },
    toolCalls: { total: 4, agents: 1, byTool: [{ tool: 'read_file', count: 2 }, { tool: 'terminal', count: 2 }] },
    worktreeBranch: null, wait: null,
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
      shape: 'group', key: 'group-call-0', family: 'reading', members,
      counts: { ok: 3, failed: 1, blocked: 0, running: 0 }, durationMs: 2_500, startedAt: at(20), inFlight: null,
      blob: members.map((m) => m.output ?? '').join('\n').slice(0, 2_000),
    },
    { shape: 'trailer', key: 'question:q-1', trailer: { trailer: 'question', requestId: 'q-1', agent: 'helper', steps: 3, title: 'Choose a branch' } },
    { shape: 'trailer', key: 'question:q-2', trailer: { trailer: 'question', requestId: 'q-2', agent: 'helper', steps: 1, title: 'Confirm the target' } },
  ];
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
        <button type="button" className="btn btn-ghost btn-compact" data-testid="proof-show-reasoning" aria-pressed={showReasoning} onClick={() => setShowReasoning((v) => !v)}>display/showReasoning: {showReasoning ? 'on' : 'off'}</button>
        <button type="button" className="btn btn-ghost btn-compact" data-testid="proof-auto-collapse" aria-pressed={autoCollapseTools} onClick={() => setAutoCollapseTools((v) => !v)}>display/autoCollapseTools: {autoCollapseTools ? 'on' : 'off'}</button>
      </div>
      <div className="rows-proof__surface" data-testid="proof-workspace">
        <WorkspaceView
          session={session} rows={rows} nowIso={at(12)}
          onSubmit={async () => REFUSED} onStop={async () => REFUSED}
          entry={{ persona: 'orchestrator', model: 'scripted', reasoning: 'high', tools: [] }}
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
    </div>
  );
}
