import { useState } from 'react';
import { confinementMessage, hostPatternProblem, NO_CONFINEMENT_DISCLOSURE, owesNoConfinementDisclosure, SANDBOX_MODE_NAMES, writableRootProblem, type ConfinementVerdict } from '@rotaris/contracts';
import type { PendingChange, PendingSettings } from './config-state.js';
import { Button as DesignButton, Card as DesignCard, Input as DesignInput, Select as DesignSelect } from '../design-system/index.js';
import { Confirm } from './ConfigSettings.js';


/**
 * ADR-0022 / ADR-0023 — the runtime section's Security policy card (Part AR).
 *
 * REQ-SANDBOX-113 requires all SIX sandbox and egress settings here "so that no YAML has to be
 * edited by hand": a sandbox-mode selector; a writable-roots list with an entry field and an add
 * button; a toggle for allowing network inside the sandbox; an egress-policy selector; allowed-hosts
 * and denied-hosts lists each with an entry field and an add button; and a per-list problem label.
 * Every control defers to Save, like the rest of the runtime section — which is REQ-SANDBOX-118's
 * rule made structural: an unsaved edit reaches NOTHING, and a run started while these hold unsaved
 * changes uses the configuration persisted on disk.
 */
export interface SecurityPolicyProps {
  readonly runtime: PendingSettings['runtime'];
  readonly onChange: (change: PendingChange) => void;
  /** null while no verdict has arrived yet — the label reads as checking (REQ-SANDBOX-129). */
  readonly confinement: ConfinementVerdict | null;
  readonly onRecheck?: (() => Promise<void>) | undefined;
  readonly dirty: boolean;
}

/**
 * REQ-SANDBOX-114: each control validates on the same terms as the stored schema, so nothing invalid
 * can reach the saved policy — nothing is stored and no unsaved-changes state is entered. Both
 * validators are the shared ones (`@rotaris/contracts`), which is what keeps this control's problem
 * label and the loader's own refusal the same sentence.
 */

/** One list with its entry field, its add button and its own problem label (REQ-SANDBOX-113). */
function EntryList(props: {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly values: readonly string[];
  readonly validate: (entry: string) => string | null;
  readonly onCommit: (next: readonly string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const add = () => {
    const entry = draft.trim();
    if (entry === '') return;
    const bad = props.validate(entry);
    // Rejected AT THE CONTROL: nothing stored, no unsaved-changes state (REQ-SANDBOX-114).
    if (bad !== null) { setProblem(bad); return; }
    setProblem(null);
    setDraft('');
    if (!props.values.includes(entry)) props.onCommit([...props.values, entry]);
  };
  return (
    <div className="settings__action settings__list" data-testid={props.id}>
      <label htmlFor={`${props.id}-entry`}>{props.label}</label>
      <DesignInput
        id={`${props.id}-entry`} className="input settings__entry" value={draft} aria-label={props.label}
        aria-description={props.hint}
        onChange={(e) => { setDraft(e.currentTarget.value); if (problem !== null) setProblem(null); }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
      />
      <DesignButton type="button" className="btn btn-secondary btn-compact" data-testid={`${props.id}-add`} onClick={add}>Add</DesignButton>
      <span className="text-secondary settings__hint">{props.hint}</span>
      {props.values.length > 0 && (
        <ul className="settings__chips" aria-label={`${props.label} entries`}>
          {props.values.map((v) => (
            <li key={v} className="settings__chip">
              <span className="mono">{v}</span>
              <DesignButton type="button" className="btn btn-link btn-compact" aria-label={`Remove ${v}`} onClick={() => props.onCommit(props.values.filter((x) => x !== v))}>Remove</DesignButton>
            </li>
          ))}
        </ul>
      )}
      {props.values.length === 0 && <span className="text-tertiary settings__hint">(none)</span>}
      {/* REQ-SANDBOX-113: a per-list problem label, and REQ-SHELL-149: the problem is TEXT. */}
      {problem !== null && <span className="composer__error" role="alert" data-testid={`${props.id}-problem`}>{problem}</span>}
    </div>
  );
}

export function SecurityPolicy({ runtime, onChange, confinement, onRecheck, dirty }: SecurityPolicyProps) {
  const [checking, setChecking] = useState(false);
  const [confirmAllow, setConfirmAllow] = useState(false);
  const recheck = async () => {
    if (!onRecheck) return;
    // REQ-SANDBOX-129: the label enters its checking state within the 100 ms responsiveness budget and
    // the probe runs off the interface thread, so nothing blocks for the up-to-5.0-second trial.
    setChecking(true);
    try { await onRecheck(); } finally { setChecking(false); }
  };
  const set = (key: keyof PendingSettings['runtime'], value: PendingSettings['runtime'][keyof PendingSettings['runtime']]): void => onChange({ kind: 'runtime', key, value });

  /*
   * REQ-SANDBOX-116: the label reflects the CURRENT availability result — that confinement is turned
   * off when it is; an active state naming the backend when a non-off mode is selected on a capable
   * host; and, on a host that cannot deliver it, an unavailable state carrying the mechanism's own
   * reason and remediation and warning that sessions will fail to start rather than start unconfined.
   */
  const availability = ((): { readonly text: string; readonly detail: string } => {
    if (checking) return { text: 'Checking…', detail: '' };
    if (confinement === null) return { text: 'Not yet checked', detail: '' };
    if (runtime.sandbox_mode === 'off') return { text: 'Confinement is turned off', detail: '' };
    if (confinement.available) return { text: `Active — ${confinement.backend}`, detail: '' };
    return {
      text: 'Unavailable on this host',
      detail: `${confinementMessage(confinement)}\nSessions that request confinement will fail to start rather than start unconfined.`,
    };
  })();

  return (
    <DesignCard className="card settings__card" data-testid="security-policy">
      {/*
        * REQ-SANDBOX-130: on a host for which no confinement mechanism exists at all — native Windows
        * most consequentially — the product states that plainly, in its own words, WITHOUT the user
        * having to select a confinement mode first. Selecting one is how a user *asks* about
        * confinement, and a user who never asks is precisely the user who does not know to. It is
        * text and leans on neither colour nor a disabled control (REQ-SHELL-149).
        */}
      {owesNoConfinementDisclosure(confinement) && (
        <p className="text-secondary settings__disclosure" data-testid="confinement-disclosure">{NO_CONFINEMENT_DISCLOSURE}</p>
      )}
      <div className="settings__action">
        <label htmlFor="sandbox-mode">Sandbox mode</label>
        <DesignSelect
          id="sandbox-mode" className="input select settings__select" aria-label="Sandbox mode"
          aria-description="Whether agent commands run inside OS-level confinement, and how much of the filesystem they may write."
          value={runtime.sandbox_mode} data-testid="sandbox-mode"
          onChange={(e) => set('sandbox_mode', e.currentTarget.value)}
        >
          {SANDBOX_MODE_NAMES.map((m) => <option key={m} value={m}>{m}</option>)}
        </DesignSelect>
        {/* REQ-SANDBOX-116: selecting a mode on an incapable host is still STORED — the setting exists for hosts that can honour it. */}
        <span className="settings__availability" role="status" data-testid="confinement-availability">{availability.text}</span>
        {onRecheck && (
          <DesignButton type="button" className="btn btn-secondary btn-compact" data-testid="confinement-recheck" disabled={checking} onClick={() => { void recheck(); }}>
            {checking ? 'Checking…' : 'Re-check'}
          </DesignButton>
        )}
      </div>
      {availability.detail !== '' && <p className="text-secondary settings__hint" data-testid="confinement-detail">{availability.detail}</p>}
      <EntryList
        id="sandbox-writable-roots" label="Writable roots"
        hint="Absolute paths writable inside the sandbox in addition to the workspace. A path that does not exist when a command runs is skipped, not an error."
        values={runtime.sandbox_writable_roots} validate={(entry) => writableRootProblem(entry)}
        onCommit={(next) => set('sandbox_writable_roots', next)}
      />
      <div className="settings__action">
        <span id="sandbox-network-label">Allow network in sandbox</span>
        <DesignButton
          type="button" role="switch" aria-labelledby="sandbox-network-label" aria-checked={runtime.sandbox_allow_network}
          aria-description={`Network access inside the sandbox is ${runtime.sandbox_allow_network ? 'allowed' : 'closed'}.`}
          className={`toggle${runtime.sandbox_allow_network ? ' is-on' : ''}`} data-testid="sandbox-allow-network"
          onClick={() => set('sandbox_allow_network', !runtime.sandbox_allow_network)}
        />
        <span className="text-secondary settings__hint">Has effect only while a confinement mode other than off is selected. The shipped posture is closed.</span>
      </div>
      <div className="settings__action">
        <label htmlFor="egress-policy">Egress policy</label>
        <DesignSelect
          id="egress-policy" className="input select settings__select" aria-label="Egress policy"
          // REQ-SANDBOX-115: the description teaches the rule users most often get backwards.
          aria-description="The disposition for a host on neither list. A denied host stays denied: deny wins over allow."
          value={runtime.network_egress_policy} data-testid="egress-policy"
          onChange={(e) => {
            // REQ-SANDBOX-117: loosening the default disposition to `allow` requires an explicit
            // confirmation first; declining leaves both the stored policy and the control as they were.
            if (e.currentTarget.value === 'allow') { setConfirmAllow(true); return; }
            set('network_egress_policy', e.currentTarget.value);
          }}
        >
          {(['allow', 'ask', 'deny'] as const).map((d) => <option key={d} value={d}>{d}</option>)}
        </DesignSelect>
        <span className="text-secondary settings__hint">The disposition for a host on neither list. A denied host stays denied: deny wins over allow.</span>
      </div>
      <EntryList
        id="network-allowed-hosts" label="Allowed hosts"
        // REQ-SANDBOX-115: the second rule users get backwards.
        hint="Exact host, or one leading wildcard as in *.example.com — which does not match example.com on its own."
        values={runtime.network_allowed_hosts} validate={(entry) => hostPatternProblem(entry)}
        onCommit={(next) => set('network_allowed_hosts', next)}
      />
      <EntryList
        id="network-denied-hosts" label="Denied hosts"
        hint="Consulted before the allowed list: a host matching here is denied whatever else says. *.example.com does not match example.com on its own."
        values={runtime.network_denied_hosts} validate={(entry) => hostPatternProblem(entry)}
        onCommit={(next) => set('network_denied_hosts', next)}
      />
      {/*
        * REQ-SANDBOX-118: because it is easy to get wrong, the surface MAKES IT VISIBLE that unsaved
        * edits reach nothing. It advises and does not block.
        */}
      {dirty && (
        <p className="text-secondary settings__hint" role="status" data-testid="security-unsaved">
          These settings have unsaved changes. A run started now uses the values saved on disk, not the ones shown here.
        </p>
      )}
      {confirmAllow && (
        <Confirm
          title="Allow every host by default?"
          body="Any host not on the denied list will then be reached without asking. The denied list still wins, but nothing else will stop an agent reaching a host you have not thought about."
          onCancel={() => setConfirmAllow(false)}
          onYes={() => { setConfirmAllow(false); set('network_egress_policy', 'allow'); }}
        />
      )}
    </DesignCard>
  );
}
