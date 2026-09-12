import { useState } from 'react';
import { DISPLAY_LINE_CAP_CHOICES, type DisplayView } from '@rotaris/contracts';
import { Toggle, type ConfigSettingsProps } from './ConfigSettings.js';
import { Select as DesignSelect } from '../design-system/index.js';

/**
 * The Display category (REQ-CONFIG-403, REQ-CONFIG-472). Six controls over two commit policies, and the
 * category says which is which in words because a user cannot otherwise tell why Save applies to half of them:
 *
 * - **Two desktop preferences** (REQ-CONFIG-403), written the moment the control moves and not undone by
 *   Discard: auto-collapse older tool outputs, and group consecutive tool calls. Both are read at startup by
 *   the renderer root, which re-renders the transcript when either changes.
 * - **Four workspace-configuration fields** (REQ-CONFIG-472, REQ-CHAT-166): whether tool results and inputs
 *   are shown and a rendered-line cap for each. These are destination 1, committed by Save (REQ-CONFIG-417),
 *   written to the `display:` section of the workspace `agents.yaml` (REQ-CONFIG-256) — and they nevertheless
 *   take effect on the rows already on screen the moment the control moves, being read from the pending state.
 *   Save decides what the file says; it never decides what the transcript is currently drawing.
 *
 * A cap of "Unlimited" is stored as `0` (REQ-CONFIG-172); the mapping is `displayCapToFile` in the contract,
 * so the surface and the reader cannot drift apart. Repopulating any control from the stored value emits no
 * change and does not mark the form dirty (REQ-CONFIG-419) — the equality guard is in `applyChange`.
 */
export interface DisplaySettingsProps {
  /** Destination 1's four fields; absent with no configuration service, which the category states (REQ-CONFIG-424). */
  readonly config?: ConfigSettingsProps | undefined;
  /** REQ-CHAT-067 (`display/autoCollapseTools`), default off. */
  readonly autoCollapseTools: boolean;
  /** REQ-CHAT-067 (`display/groupTools`), default **on**. */
  readonly groupTools: boolean;
  readonly onAutoCollapseTools: (value: boolean) => Promise<{ ok: true } | { ok: false; reason: string }>;
  readonly onGroupTools: (value: boolean) => Promise<{ ok: true } | { ok: false; reason: string }>;
}

const capLabel = (cap: number | null): string => (cap === null ? 'Unlimited' : `${cap} ${cap === 1 ? 'line' : 'lines'}`);
const capKey = (cap: number | null): string => (cap === null ? 'unlimited' : String(cap));

/** REQ-CONFIG-318: a stored value outside the offered set is appended and shown, never quietly replaced. */
function capOptions(stored: number | null): readonly (number | null)[] {
  return DISPLAY_LINE_CAP_CHOICES.includes(stored) ? DISPLAY_LINE_CAP_CHOICES : [...DISPLAY_LINE_CAP_CHOICES, stored];
}

function CapSelect({ id, label, description, value, disabled, onChange }: {
  id: string; label: string; description: string; value: number | null; disabled: boolean; onChange: (cap: number | null) => void;
}) {
  return (
    <div className="settings__action">
      <label htmlFor={id}>{label}</label>
      <DesignSelect
        id={id}
        data-testid={id}
        className="input select settings__select"
        aria-label={label}
        aria-description={description}
        disabled={disabled}
        value={capKey(value)}
        onChange={(e) => onChange(e.currentTarget.value === 'unlimited' ? null : Number(e.currentTarget.value))}
      >
        {capOptions(value).map((cap) => <option key={capKey(cap)} value={capKey(cap)}>{capLabel(cap)}</option>)}
      </DesignSelect>
      <span className="text-secondary settings__hint">{description}</span>
    </div>
  );
}

export function DisplaySettings({ config, autoCollapseTools, groupTools, onAutoCollapseTools, onGroupTools }: DisplaySettingsProps) {
  const [message, setMessage] = useState<string | null>(null);
  const pending: DisplayView | null = config?.pending?.display ?? null;
  const noService = pending === null;
  /**
   * The caps are read through the whole value, never field by field with a nullish fallback. Measured on this
   * part's first execution: `pending?.tool_input_lines ?? 2` reads "unlimited" — which this view spells `null` —
   * as "no value" and substitutes the default, so a saved unlimited came back on the control as 2 lines while the
   * file said 0. Absent configuration and a cap of unlimited are two different things and are told apart here.
   */
  const caps: DisplayView = pending ?? { show_tool_results: true, show_tool_inputs: true, tool_result_lines: 10, tool_input_lines: 2 };
  const write = async (run: () => Promise<{ ok: true } | { ok: false; reason: string }>) => {
    const r = await run();
    setMessage(r.ok ? null : r.reason);
  };
  const set = (key: keyof DisplayView, value: DisplayView[keyof DisplayView]) => config?.onChange({ kind: 'display', key, value });

  return (
    <div className="settings__section">
      <h1 className="display">Display</h1>

      <h2 className="settings__heading">Transcript</h2>
      <p className="text-secondary">These two are yours, not this workspace's: they are kept with your desktop preferences, take effect as you change them, and Discard does not undo them.</p>
      <Toggle
        id="auto-collapse-tools"
        testId="auto-collapse-tools"
        label="Auto-collapse older tool outputs"
        hint="The latest tool call and its result stay open; earlier rows collapse to the tool name with a control to expand them again."
        on={autoCollapseTools}
        onChange={(v) => { void write(() => onAutoCollapseTools(v)); }}
      />
      <Toggle
        id="group-tools"
        testId="group-tools"
        label="Group consecutive tool calls"
        hint="A run of same-kind calls becomes one counting row naming the call in flight, which expands to the individual calls."
        on={groupTools}
        onChange={(v) => { void write(() => onGroupTools(v)); }}
      />

      <h2 className="settings__heading">Tool rows</h2>
      <p className="text-secondary">
        These four are this workspace's configuration and are written on Save. A change shows on the rows already on screen straight away —
        Save settles what the file says, not what the transcript is drawing. A cap changes only what is drawn: the session record keeps the
        full text, so raising a cap or reopening the session shows the rest without re-running anything.
      </p>
      {noService && <p className="text-secondary">No configuration service, so these four cannot be read or changed here.</p>}
      <Toggle
        id="show-tool-results"
        testId="show-tool-results"
        label="Show tool results"
        hint="Draw what a tool returned on its row. Hidden, the result is still recorded and still reaches the model."
        on={caps.show_tool_results}
        disabled={noService}
        onChange={(v) => set('show_tool_results', v)}
      />
      <CapSelect
        id="tool-result-lines"
        label="Result lines"
        description="How many lines of a tool result are drawn before the row states how many further lines exist."
        value={caps.tool_result_lines}
        disabled={noService || !caps.show_tool_results}
        onChange={(cap) => set('tool_result_lines', cap)}
      />
      <Toggle
        id="show-tool-inputs"
        testId="show-tool-inputs"
        label="Show tool inputs"
        hint="Draw the arguments a tool was called with on its row."
        on={caps.show_tool_inputs}
        disabled={noService}
        onChange={(v) => set('show_tool_inputs', v)}
      />
      <CapSelect
        id="tool-input-lines"
        label="Input lines"
        description="How many lines of a tool input are drawn before the row states how many further lines exist."
        value={caps.tool_input_lines}
        disabled={noService || !caps.show_tool_inputs}
        onChange={(cap) => set('tool_input_lines', cap)}
      />
      {message && <div className="composer__error" role="alert">{message}</div>}
    </div>
  );
}
