import { useEffect, useRef, useState } from 'react';
import type { AgentRecord, SessionRecord, TranscriptRow } from '@rotaris/contracts';
import { agentArtifacts, chipStates, countNoun, instancesOf, mcpFateText, personaArtifacts, resolvedTools, rowsOf } from './agents.js';
import { AgentArtifactLinks, ArtifactLinkList } from './ArtifactLinks.js';
import { AgentCancelConfirm } from './AgentCancelConfirm.js';
import { elapsedLabel, elapsedShown } from './AgentTree.js';
import { ContextRing } from './ContextRing.js';
import { RowList, type Acknowledger } from './TranscriptSurface.js';
import type { TerminalPreview } from './terminal/streams.js'; // Part AL2
import { personaColourToken } from './transcript/Row.js';
import { markMotionStart } from './motion.js';
import { Button as DesignButton, EmptyState as DesignEmptyState, PageHeader as DesignPageHeader, TextArea as DesignTextArea } from './design-system/index.js';

/**
 * REQ-SHELL-074/075, REQ-MONITOR-068..071 (Part R): the persona pop-out window's content. The header with the persona
 * name and the instance count with its noun agreeing (REQ-SHELL-044); one tab per instance live or finished, text the
 * agent's name, tooltip `{state} · {activity}`; the "Artifacts by {persona} (all instances)" card with its empty
 * sentence; per tab, in order: (a) the heading — the dot pulsing only while live, the name in the persona's colour,
 * the muted state; (b) the "Agent transcript" card (accessible name `{name} transcript`, min height 260 px, the
 * empty sentence) showing only that agent's rows through the ONE row renderer; (c) "Context" with the ring and
 * `{n} tool calls · {elapsed}`; (d) "Instance controls" read-only (REQ-MONITOR-059); (e) "Current activity";
 * (f) "Tools and artifacts" — native tools and the active ones, one muted line per MCP server (REQ-MCP-100, wired at the merge), and
 * the instance's artifact links, produced and received (live-run finding K1; the persona-wide card lists every instance's); (g) "Steer agent"
 * with the placeholder, "Send steer" (empty or whitespace sends nothing; accepted clears; refused keeps the text,
 * REQ-MONITOR-070) and the danger "Cancel" for that instance. The terminal-preview parity of REQ-SHELL-075 (b) was
 * owed with ADR-0021 until Part AL2: the window now draws the live preview from its own stream set (`terminalPreview`).
 */
export interface PersonaWindowProps {
  readonly persona: string;
  readonly session: SessionRecord | null;
  readonly rows: readonly TranscriptRow[];
  readonly runLevel: AgentRecord | null;
  readonly declaredTools: readonly string[];
  readonly selectedAgentId: string | null;
  readonly onSelectTab: (id: string) => void;
  readonly nowIso: string | null;
  readonly compressionThresholdPercent: number;
  readonly onSteer: (agentId: string, text: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  readonly onCancel: (agentId: string) => Promise<{ ok: true } | { ok: false; reason: string }>;
  /** A raise asked the steer card to take focus (REQ-MONITOR-137: the inspector's Steer opens this card). */
  readonly focusSteer?: number | undefined;
  /** Part AA — REQ-CHAT-076: `http(s)` links open through `shell.openExternal`; without an opener a link is inert (ADR-0051). */
  readonly onOpenLink?: ((href: string) => void) | undefined;
  /** Part AA — REQ-CHAT-075: this window's own acknowledgement stack (ADR-0049: one per window). */
  readonly onAcknowledge?: Acknowledger | undefined;
  /** Part AA — REQ-CHAT-167 / REQ-CHAT-067: the two display preferences, read once by the root and passed down. */
  readonly showReasoning?: boolean | undefined;
  readonly autoCollapseTools?: boolean | undefined;
  /**
   * Part AL2 — REQ-SHELL-075 (b) / REQ-SHELL-079 / REQ-SHELL-102: the live terminal preview in this window's transcript
   * card, read from THIS renderer's own `TerminalStreamSet` (ADR-0021: a separate renderer runs its own display emulator
   * over the same frames from the same subscription point; ADR-0047 consequence 2), and the click that requests the
   * pop-out (REQ-CHAT-076) — the same two surface fields the main window's pane carries, so the row draws the same block.
   */
  readonly terminalPreview?: ((streamId: string) => TerminalPreview | null) | undefined;
  readonly openTerminal?: ((streamId: string) => void) | undefined;
  /** REQ-MONITOR-068/069 (live-run finding K1): follow an artifact link — the window's root opens the artifact. */
  readonly onOpenArtifact?: ((id: string) => void) | undefined;
}

export const TRANSCRIPT_EMPTY = 'No transcript activity for this agent yet.';
export const ARTIFACTS_EMPTY = 'No artifacts published yet.';
/** REQ-MONITOR-069 (live-run finding K1): the instance's own artifact line when it produced and received none. */
export const INSTANCE_ARTIFACTS_EMPTY = 'No artifacts produced or received.';
export const STEER_PLACEHOLDER = 'Add context or redirect this agent…';
export const ACTIVITY_EMPTY = 'No activity text has been recorded for this agent.';

/**
 * REQ-SHELL-075 (a): the persona's assigned colour — one of six named tokens of the adopted language by a stable
 * hash of the name (never a literal colour). Part AA moved the one definition into `transcript/Row.tsx`, where
 * REQ-CHAT-057's continuation bar is its second reader; re-exported here so nothing that named it breaks.
 */
export { personaColourToken };

export function PersonaWindow(props: PersonaWindowProps) {
  const { persona, session, rows, runLevel, declaredTools, selectedAgentId, onSelectTab, nowIso, compressionThresholdPercent, onSteer, onCancel, focusSteer, onOpenLink, onAcknowledge, showReasoning = false, autoCollapseTools = false, terminalPreview, openTerminal, onOpenArtifact } = props;
  const agents = session?.agents ?? [];
  const instances = instancesOf(persona, agents, runLevel);
  const shown = instances.find((a) => a.id === selectedAgentId) ?? instances[0] ?? null;
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  // REQ-MONITOR-126 / REQ-MONITOR-128: the Cancel is confirmed first — the run instance's is the run's final cancel.
  const [confirming, setConfirming] = useState<{ readonly id: string; readonly name: string } | null>(null);
  const steerBox = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (focusSteer !== undefined && focusSteer > 0) steerBox.current?.focus(); }, [focusSteer]);
  const send = async () => {
    if (!shown) return;
    // REQ-MONITOR-070: empty or whitespace-only issues no request and changes nothing.
    if (text.trim() === '') return;
    const r = await onSteer(shown.id, text);
    if (r.ok) { setText(''); setError(null); } else setError(r.reason);
  };
  const own = shown ? rowsOf(rows, shown) : [];
  const chips = shown ? chipStates(resolvedTools(shown, declaredTools), shown.calledTools, shown.activeTools) : [];
  const elapsed = shown && elapsedShown(shown) ? elapsedLabel(shown, nowIso) : null;
  // REQ-MONITOR-068/069 (live-run finding K1): the persona-wide card and the instance's own links, from the session's artifacts.
  const byPersona = personaArtifacts(instances, session?.artifacts ?? []);
  const links = shown ? agentArtifacts(shown, session?.artifacts ?? []) : { produced: [], received: [] };
  return (
    <div className="persona-window" data-persona={persona} data-shown={shown?.id ?? ''} data-instances={instances.length}>
      <DesignPageHeader className="persona-window__header page-header">
        <h1 className="display persona-window__title" style={{ color: `var(${personaColourToken(persona)}, var(--rt-text))` }}>{persona}</h1>
        <span className="page-header-sub mono" data-testid="persona-count">{countNoun(instances.length, 'instance')}</span>
      </DesignPageHeader>
      <div className="tabs persona-window__tabs" role="tablist" aria-label={`${persona} instances`}>
        {instances.map((a) => (
          <DesignButton key={a.id} type="button" role="tab" className={`tab${shown?.id === a.id ? ' is-active' : ''}`} aria-selected={shown?.id === a.id} data-agent-id={a.id} title={`${a.presentationState} · ${a.activity || '—'}`} onClick={() => onSelectTab(a.id)}>{a.name}</DesignButton>
        ))}
        {instances.length === 0 && <span className="text-secondary">No instance of {persona} in the followed session.</span>}
      </div>
      <section className="card persona-window__artifacts" aria-label={`Artifacts by ${persona} (all instances)`}>
        <div className="ov-card__head"><span className="card-kicker">Artifacts by {persona} (all instances)</span></div>
        <div className="card-body" data-testid="persona-artifacts" data-count={byPersona.length}>{byPersona.length === 0 ? <span className="text-secondary">{ARTIFACTS_EMPTY}</span> : <ArtifactLinkList links={byPersona} onOpen={onOpenArtifact} testId="persona-artifacts-links" />}</div>
      </section>
      {shown && (
        <div className="persona-window__page" role="tabpanel" aria-label={shown.name}>
          <div className="persona-window__heading">
            <span ref={(element) => { if (element && shown.live) markMotionStart(element); }} className={`agent-row__dot agent-row__dot--${shown.presentationState}`} aria-hidden="true" />
            <span className="persona-window__name" style={{ color: `var(${personaColourToken(persona)}, var(--rt-text))` }} data-testid="persona-agent-name">{shown.name}</span>
            <span className="text-secondary mono" data-testid="persona-agent-state">{shown.presentationState}</span>
          </div>
          <section className="card persona-window__transcript" aria-label={`${shown.name} transcript`} data-testid="persona-transcript" data-rows={own.length}>
            <div className="ov-card__head"><span className="card-kicker">Agent transcript</span><span className="card-meta">{countNoun(own.length, 'row')}</span></div>
            <div className="transcript persona-window__rows" role="log" aria-live="polite">
              {own.length === 0
                ? <DesignEmptyState className="empty-state"><span className="empty-state-title">{TRANSCRIPT_EMPTY}</span></DesignEmptyState>
                : (
                  // Part AA: the SAME `Row` the Workspace draws (Part R's one-renderer rule), over a plain list rather
                  // than Part Z's recycled pool — this is a small agent-scoped transcript and ADR-0045's invariance
                  // claim is about the main window's. The choice is recorded in `TranscriptSurface.tsx`'s head comment.
                  <RowList
                    rows={own}
                    label={`${shown.name} transcript`}
                    acknowledge={onAcknowledge}
                    surface={{ showReasoning, autoCollapseTools, runActive: shown.live, nowMs: nowIso === null ? 0 : Date.parse(nowIso), openLink: onOpenLink, terminalPreview, openTerminal }}
                  />
                )}
            </div>
            {/* Part AL2: the terminal preview streams into this window now (REQ-SHELL-075 b); the note that said it did not is gone with the reason. */}
          </section>
          <section className="card persona-window__context" aria-label="Context">
            <div className="ov-card__head"><span className="card-kicker">Context</span></div>
            <div className="persona-window__context-body">
              <ContextRing used={shown.contextUsed} limit={shown.contextLimit} thresholdPercent={compressionThresholdPercent} label={`${shown.name}'s context window`} />
              <div>
                <div className="mono" data-testid="persona-context-line">{countNoun(shown.toolCalls, 'tool call')} · {elapsed ?? '-'}</div>
                <div className="text-secondary">{shown.contextUsed.toLocaleString()} of {shown.contextLimit.toLocaleString()} tokens; compression at {compressionThresholdPercent}%.</div>
              </div>
            </div>
          </section>
          <section className="card persona-window__controls" aria-label="Instance controls">
            <div className="ov-card__head"><span className="card-kicker">Instance controls</span><span className="card-meta">read-only</span></div>
            <dl className="persona-window__readings">
              <dt>Model</dt><dd className="mono" data-testid="persona-model">{shown.model || '—'}</dd>
              <dt>Reasoning</dt><dd className="mono" data-testid="persona-reasoning">{shown.reasoning}</dd>
            </dl>
          </section>
          <section className="card persona-window__activity" aria-label="Current activity">
            <div className="ov-card__head"><span className="card-kicker">Current activity</span></div>
            <div className="card-body">{shown.activity ? <p className="persona-window__activity-text">{shown.activity}</p> : <span className="text-secondary">{ACTIVITY_EMPTY}</span>}</div>
          </section>
          <section className="card persona-window__tools" aria-label="Tools and artifacts">
            <div className="ov-card__head"><span className="card-kicker">Tools and artifacts</span></div>
            <div className="chips" data-testid="persona-chips">
              {chips.length === 0 && <span className="text-secondary">No tools resolved.</span>}
              {chips.map((c) => <span key={c.name} className={`tag chip chip--${c.state.replace(' ', '-')}`} data-tool={c.name} data-state={c.state}>{c.name} <span className="chip__state">{c.state}</span></span>)}
            </div>
            {shown.mcpServers.map((srv) => (
              <div key={srv.name} className="text-secondary persona-window__mcp" data-mcp-server={srv.name} data-fate={srv.fate}>
                {srv.name}: {srv.fate === 'connected' ? ((shown.grantedMcp[srv.name] ?? []).join(', ') || 'no tools granted') : mcpFateText(srv)}
              </div>
            ))}
            <div className="text-secondary">Active now: {shown.activeTools.length === 0 ? 'none' : shown.activeTools.join(', ')}.</div>
            <div className="persona-window__instance-artifacts" data-testid="persona-instance-artifacts" data-produced={links.produced.length} data-received={links.received.length}>
              <AgentArtifactLinks produced={links.produced} received={links.received} empty={INSTANCE_ARTIFACTS_EMPTY} onOpen={onOpenArtifact} testId="persona-instance-artifacts" />
            </div>
          </section>
          <section className="card persona-window__steer" aria-label="Steer agent">
            <div className="ov-card__head"><span className="card-kicker">Steer agent</span></div>
            <DesignTextArea ref={steerBox} className="input persona-window__steer-box" aria-label="Steer text" placeholder={STEER_PLACEHOLDER} rows={3} value={text} onChange={(e) => setText(e.currentTarget.value)} data-testid="persona-steer" />
            {error && <div className="composer__error" role="alert" data-testid="persona-steer-error">{error}</div>}
            <div className="dialog-actions persona-window__steer-actions">
              <DesignButton type="button" className="btn btn-primary" data-testid="persona-send" onClick={() => { void send(); }}>Send steer</DesignButton>
              <DesignButton type="button" className="btn btn-danger" data-testid="persona-cancel" onClick={() => setConfirming({ id: shown.id, name: shown.name })}>Cancel</DesignButton>
            </div>
          </section>
        </div>
      )}
      {confirming && (
        <AgentCancelConfirm agent={confirming} agents={agents} testId="persona-cancel-confirm" onCancel={() => setConfirming(null)}
          onConfirm={() => { const target = confirming; setConfirming(null); void onCancel(target.id).then((r) => setError(r.ok ? null : r.reason)); }} />
      )}
    </div>
  );
}
