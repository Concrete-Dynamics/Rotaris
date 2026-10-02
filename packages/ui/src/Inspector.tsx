import { useMemo, useState } from 'react';
import { RUN_AGENT_ID, type AgentRecord, type SessionRecord, type TranscriptRow } from '@rotaris/contracts';
import { agentArtifacts, cancelCascade, cancelOffered, cancelUnavailableReason, cascadeNote, chipStates, followedAgent, inspectorEnablement, instancesOf, mcpChipStates, mcpFateText, metaLine, resolvedTools } from './agents.js';
import { elapsedLabel, elapsedShown } from './AgentTree.js';
import { AgentArtifactLinks } from './ArtifactLinks.js';
import { ContextRing } from './ContextRing.js';
import { markMotionStart } from './motion.js';
import { Button as DesignButton, SearchableSelect as DesignSearchableSelect, Select as DesignSelect } from './design-system/index.js';
import { PopoverMenu } from './design-system/overlays.js';

/**
 * REQ-MONITOR-050..067 (Part R): the per-agent inspector. One tab per configured persona (050); the selected
 * agent's persona tab and instance (050); with nothing selected, the agent that wrote last, as a visible tag says
 * (053/054); the empty state (056); the dot, the name, the meta line, the ring with the threshold marked and its
 * caption (052/065); the model and reasoning controls writable for the run-level agent while a run executes with the
 * next-iteration note, otherwise disabled with the per-persona note (057/058), the current model always named
 * (066), withheld models listed with their reason (067); the scope note; the tool chips in the resolved set's own
 * order marked active/used/not used (060/061/062) — the run-level agent's from `entryTools` since live-run finding K1;
 * artifact links, produced and received, each opening the artifact (052, K1: `SessionRecord.artifacts`); the cascade note
 * (064); Steer, Cancel and Pop out on the SHOWN agent with 063's enablement and 055's naming. Structure from
 * docs/spec; language from docs/design/system. The MCP heading per server (060's second half, REQ-MCP-065/114) was
 * wired at the merge of Parts R and S from the record's `mcpServers` and `grantedMcp`.
 */
export interface PersonaEntry {
  readonly role: string;
  readonly tools: readonly string[];
  readonly thinking: string | null;
  readonly effectiveModel: string;
}
export interface InspectorProps {
  readonly session: SessionRecord | null;
  readonly rows: readonly TranscriptRow[];
  readonly personas: readonly PersonaEntry[];
  readonly runLevel: AgentRecord | null;
  readonly selectedAgentId: string | null;
  readonly onSelect: (id: string | null) => void;
  readonly models: readonly string[];
  /** REQ-MONITOR-067: models the provider withholds, with its reason; empty in this build (no provider reports one). */
  readonly withheldModels?: readonly { readonly model: string; readonly reason: string }[] | undefined;
  readonly compressionThresholdPercent: number;
  readonly runActive: boolean;
  /**
   * PD-ORCH-005 clause 16 (OQ-101): the session rests with an iteration open (`runLevelResting`, which only the caller can
   * ask, since REQ-CHAT-008's recovery state is the renderer's to know) — when a `paused` child offers Cancel.
   */
  readonly resting: boolean;
  readonly nowIso: string | null;
  readonly onSteer: (agent: AgentRecord) => void;
  readonly onCancel: (agent: AgentRecord, cascade: number) => void;
  readonly onPopOut: (agent: AgentRecord) => void;
  readonly onSetModel?: ((model: string) => Promise<{ ok: true } | { ok: false; reason: string }>) | undefined;
  readonly onSetReasoning?: ((level: string) => Promise<{ ok: true } | { ok: false; reason: string }>) | undefined;
  /** REQ-MONITOR-051: rendered as an overlay drawer below 1180 px; the caller says whether it is open there. */
  readonly drawer?: boolean | undefined;
  readonly onCloseDrawer?: (() => void) | undefined;
  /** REQ-MONITOR-052 / REQ-LIBRARY-102 (live-run finding K1): follow an artifact link — the caller opens the artifact. */
  readonly onOpenArtifact?: ((id: string) => void) | undefined;
}

export const FOLLOWING_TAG = 'Following — tracking whichever agent wrote last';
export const PINNED_TAG = 'Pinned by selection';
export const PER_PERSONA_NOTE = 'Model and reasoning are set per persona and edited in persona settings.';
export const NEXT_ITERATION_NOTE = 'Takes effect from the next iteration.';
/** REQ-MONITOR-052 (live-run finding K1): the empty sentence — it said "this build has no artifact store", false since Part Y. */
export const NO_ARTIFACTS = 'This agent has produced and received no artifacts yet.';

export function Inspector(props: InspectorProps) {
  const { session, rows, personas, runLevel, selectedAgentId, onSelect, models, withheldModels = [], compressionThresholdPercent, runActive, resting, nowIso, onSteer, onCancel, onPopOut, onSetModel, onSetReasoning, drawer = false, onCloseDrawer, onOpenArtifact } = props;
  const agents = useMemo(() => session?.agents ?? [], [session]);
  const selected = useMemo(() => (selectedAgentId === RUN_AGENT_ID ? runLevel : agents.find((a) => a.id === selectedAgentId) ?? null), [selectedAgentId, agents, runLevel]);
  // PD-ORCH-005 clause 4 with OQ-97: the run-level agent owns the rows its roots wrote, under whichever name each carries.
  const followed = useMemo(() => (selected ? null : followedAgent(rows, agents, runLevel, session?.entryRoots)), [selected, rows, agents, runLevel, session]);
  const shown = selected ?? followed;
  const pinned = selected !== null;
  // REQ-MONITOR-050: the tab follows the shown agent's persona (derived during render when the shown agent changes); a tab chosen by hand stays until an agent is chosen.
  const [tab, setTab] = useState<string | null>(null);
  const [seenShown, setSeenShown] = useState<string | null>(shown?.id ?? null);
  if ((shown?.id ?? null) !== seenShown) { setSeenShown(shown?.id ?? null); if (shown) setTab(shown.persona); }
  const activeTab = tab ?? shown?.persona ?? personas[0]?.role ?? null;
  const [error, setError] = useState<string | null>(null);
  const persona = personas.find((p) => p.role === (shown?.persona ?? activeTab)) ?? null;
  const enablement = inspectorEnablement(shown?.presentationState ?? null);
  const isRunLevel = shown !== null && shown.id === RUN_AGENT_ID;
  const writable = isRunLevel && runActive && shown?.live === true;
  const cascade = shown ? cancelCascade(agents, shown) : [];
  // PD-ORCH-005 clause 16: a paused child offers Cancel while its session rests; a live agent while its run is active.
  const cancellable = cancelOffered(shown, runActive, resting);
  const chips = shown ? chipStates(resolvedTools(shown, persona?.tools ?? []), shown.calledTools, shown.activeTools) : [];
  const elapsed = shown && elapsedShown(shown) ? elapsedLabel(shown, nowIso) : null;
  const links = shown ? agentArtifacts(shown, session?.artifacts ?? [], session?.entryRoots) : { produced: [], received: [] };
  const currentModel = shown?.model ?? '';
  const modelOptions = useMemo(() => {
    // REQ-MONITOR-066: the current model is always an option, even when the catalogue no longer lists it.
    const list = [...models];
    if (currentModel !== '' && !list.includes(currentModel)) list.unshift(currentModel);
    return list;
  }, [models, currentModel]);
  const instances = activeTab ? instancesOf(activeTab, agents, runLevel) : [];
  return (
    <aside className={`inspector${drawer ? ' inspector--drawer' : ''}`} aria-label="Agent inspector" data-shown={shown?.id ?? ''} data-mode={shown ? (pinned ? 'pinned' : 'following') : 'empty'}>
      <div className="inspector__head">
        <span className="card-kicker">Inspector</span>
        <span className={`tag ${pinned ? 'tag-accent' : 'tag-neutral'} inspector__tag`} data-testid="inspector-tag">{shown ? (pinned ? PINNED_TAG : FOLLOWING_TAG) : 'No agent'}</span>
        {pinned && <DesignButton type="button" className="btn btn-ghost btn-compact" onClick={() => onSelect(null)} title="Drop the selection; the panel returns to tracking whichever agent wrote last.">Unpin</DesignButton>}
        {onCloseDrawer && <DesignButton type="button" className="btn btn-ghost btn-compact" aria-label="Close the inspector" onClick={onCloseDrawer}>×</DesignButton>}
      </div>
      {/*
        * Density review 2026-09-13: the persona strip drew one 32 px `.tab` per configured persona, and a
        * twelve-persona configuration wrapped it into four rows — 161 px of chrome before any content. The
        * mockup draws no tab grid at all; the picker is PD-CHAT-001's press-revealed popover, which keeps
        * REQ-MONITOR-050's "one selector per configured persona" (the grouping is the persona set, not a
        * tab-strip widget) and carries PopoverMenu's own keyboard model in place of REQ-SHELL-152's strip
        * rule. The instance row beneath is unchanged.
        */}
      <div className="inspector__picker" data-testid="inspector-picker">
        <PopoverMenu
          ariaLabel="Persona"
          icon="ph-users-three"
          value={activeTab ?? '—'}
          title="Group the inspector by persona."
          options={personas.map((p) => ({ value: p.role, label: p.role }))}
          onChoose={(role) => setTab(role)}
        />
      </div>
      {activeTab && (
        <div className="inspector__instances" aria-label={`${activeTab} instances`}>
          {instances.length === 0 ? <span className="text-secondary">No instance of {activeTab} in this run.</span> : instances.map((a) => (
            <DesignButton key={a.id} type="button" className={`btn btn-ghost btn-compact inspector__instance${shown?.id === a.id ? ' is-active' : ''}`} data-agent-id={a.id} aria-pressed={shown?.id === a.id} onClick={() => onSelect(a.id)}>{a.name}</DesignButton>
          ))}
        </div>
      )}
      {shown ? (
        <div className="inspector__body">
          <div className="inspector__title">
            <span ref={(element) => { if (element && shown.live) markMotionStart(element); }} className={`agent-row__dot agent-row__dot--${shown.presentationState}`} aria-hidden="true" />
            <span className="inspector__name" data-testid="inspector-name">{shown.name}</span>
          </div>
          <div className="inspector__meta mono" data-testid="inspector-meta">{metaLine(shown, elapsed)}</div>
          <div className="inspector__ring">
            <ContextRing used={shown.contextUsed} limit={shown.contextLimit} thresholdPercent={compressionThresholdPercent} label={`${shown.name}'s context window`} />
            <div className="inspector__ring-caption text-secondary">
              <div>This agent's own context window: {shown.contextUsed.toLocaleString()} of {shown.contextLimit.toLocaleString()} tokens.</div>
              <div>Compression at {compressionThresholdPercent}% of the limit. Not a session-wide figure.</div>
            </div>
          </div>
          <div className="inspector__controls">
            <label className="field-label" htmlFor="inspector-model">Model</label>
            <DesignSearchableSelect id="inspector-model" className="input select" ariaLabel="Agent model" value={currentModel} disabled={!writable} aria-describedby="inspector-controls-note" data-testid="inspector-model"
              title={currentModel === '' ? undefined : currentModel}
              filterPlaceholder="Filter models…"
              options={[...modelOptions.map((m) => ({ value: m, label: m })), ...withheldModels.map((w) => ({ value: w.model, label: w.model, unavailableReason: w.reason, suffix: `withheld: ${w.reason}` }))]}
              onChange={(v) => { if (onSetModel && v !== '' && v !== currentModel) void onSetModel(v).then((r) => setError(r.ok ? null : r.reason)); }} />
            <label className="field-label" htmlFor="inspector-reasoning">Reasoning</label>
            <DesignSelect id="inspector-reasoning" className="input select" aria-label="Agent reasoning" value={['low', 'medium', 'high'].includes(shown.reasoning) ? shown.reasoning : 'medium'} disabled={!writable} aria-describedby="inspector-controls-note" data-testid="inspector-reasoning" onChange={(e) => { const v = e.currentTarget.value; if (onSetReasoning) void onSetReasoning(v).then((r) => setError(r.ok ? null : r.reason)); }}>
              {['low', 'medium', 'high'].map((l) => <option key={l} value={l}>{l}</option>)}
            </DesignSelect>
            <span id="inspector-controls-note" className="text-secondary inspector__note" data-testid="inspector-controls-note">{writable ? NEXT_ITERATION_NOTE : PER_PERSONA_NOTE}</span>
          </div>
          <div className="inspector__scope text-secondary" data-testid="inspector-scope">
            {isRunLevel ? 'Scope: the run itself — the entry role at depth 0.' : `Scope: depth ${shown.depth}${shown.background ? ', background' : ''}${shown.category ? `, ${shown.category}` : ''} — reports to ${agents.find((a) => a.id === shown.parentId)?.name ?? 'the run'}.`}
          </div>
          <div className="inspector__tools" aria-label="Tools">
            <span className="card-kicker">Tools</span>
            <div className="chips" data-testid="inspector-chips">
              {chips.length === 0 && <span className="text-secondary">No tools resolved.</span>}
              {chips.map((c) => <span key={c.name} className={`tag chip chip--${c.state.replace(' ', '-')}`} data-tool={c.name} data-state={c.state}>{c.name} <span className="chip__state">{c.state}</span></span>)}
            </div>
            {shown.mcpServers.map((srv) => (
              <div key={srv.name} className="inspector__mcp" role="group" aria-label={`MCP server ${srv.name}`} data-mcp-server={srv.name} data-fate={srv.fate}>
                <span className="card-kicker">MCP server {srv.name} <span className="text-secondary">· {srv.transport} · {srv.origin} · {mcpFateText(srv)}</span></span>
                <div className="chips">
                  {(shown.grantedMcp[srv.name] ?? []).length === 0 && <span className="text-secondary">No tools granted.</span>}
                  {mcpChipStates(srv.name, shown.grantedMcp[srv.name] ?? [], shown.calledTools, shown.activeTools).map((c) => <span key={c.name} className={`tag chip chip--${c.state.replace(' ', '-')}`} data-tool={c.name} data-state={c.state}>{c.name} <span className="chip__state">{c.state}</span></span>)}
                </div>
              </div>
            ))}
          </div>
          <div className="inspector__artifacts" aria-label="Artifacts" data-testid="inspector-artifacts" data-produced={links.produced.length} data-received={links.received.length}>
            <span className="card-kicker">Artifacts</span>
            <AgentArtifactLinks produced={links.produced} received={links.received} empty={NO_ARTIFACTS} onOpen={onOpenArtifact} testId="inspector-artifacts" />
          </div>
          <div className="inspector__cascade" data-testid="inspector-cascade" aria-live="polite">{cascadeNote(cascade)}</div>
          {error && <div className="composer__error" role="alert">{error}</div>}
          <div className="inspector__actions">
            <DesignButton type="button" className="btn btn-secondary btn-compact" disabled={!enablement.steer || !runActive} title={enablement.steer && runActive ? `Steer ${shown.name} through its persona window` : 'Steer is enabled while the agent is running or waiting.'} onClick={() => onSteer(shown)}>Steer</DesignButton>
            <DesignButton type="button" className="btn btn-danger btn-compact" data-testid="inspector-cancel" disabled={!cancellable} title={cancellable ? `Cancel ${shown.name}` : cancelUnavailableReason(shown)} onClick={() => onCancel(shown, cascade.length)}>Cancel</DesignButton>
            <DesignButton type="button" className="btn btn-secondary btn-compact" disabled={!enablement.popOut} onClick={() => onPopOut(shown)}>Pop out</DesignButton>
          </div>
        </div>
      ) : (
        <div className="inspector__body inspector__body--empty" data-testid="inspector-empty">
          <div className="inspector__title"><span className="agent-row__dot agent-row__dot--idle" aria-hidden="true" /><span className="inspector__name">—</span></div>
          <div className="text-secondary">No agent is selected, and no transcript row names one.</div>
          <div className="inspector__ring"><ContextRing used={0} limit={1} thresholdPercent={compressionThresholdPercent} label="No agent's context window" /></div>
          <div className="inspector__actions">
            <DesignButton type="button" className="btn btn-secondary btn-compact" disabled>Steer</DesignButton>
            <DesignButton type="button" className="btn btn-danger btn-compact" disabled>Cancel</DesignButton>
            <DesignButton type="button" className="btn btn-secondary btn-compact" disabled>Pop out</DesignButton>
          </div>
        </div>
      )}
    </aside>
  );
}
