import { Fragment, useMemo, useRef, useState } from 'react';
import {
  childLimitsLabel, isWarningStop, MONEY_RULE_ALL_SET, MONEY_STOP_LABELS, MONEY_STOP_SENTENCES, MONEY_STOPS, resolveMoneyStop,
  type LeverMark, type LeverOrigin, type LeverResult, type MoneyLevers, type MoneyResolution, type MoneyStop, type RoleResult,
} from '@rotaris/contracts';
import { Button as DesignButton, Origin, PopoverPanel, StepSlider, Table as DesignTable, type StepSliderStep, type ValueOrigin } from './design-system/index.js';
import { STRATEGY_LABELS } from './strategy-labels.js';

/**
 * PD-ORCH-021 clause 9 — the money slider as the composer and Settings draw it (`docs/design/briefs/composer.md`): five
 * stops in clause 9's order, one sentence each, and for the composer a press-revealed panel whose preview says what the next
 * run would get at the stop under the pointer or focus, every lever marked moved, set or left ("stays"). No currency and no
 * relative cost anywhere. The levers are the configuration snapshot's (`moneyLevers`), resolved here by the same function
 * the run host resolves them with (`resolveMoneyStop`), so the preview and the run never read them differently.
 */
export const MONEY_SLIDER_STEPS: readonly StepSliderStep[] = MONEY_STOPS.map((stop) => ({
  label: MONEY_STOP_LABELS[stop],
  description: MONEY_STOP_SENTENCES[stop],
  ...(isWarningStop(stop) ? { tone: 'warn' as const } : {}),
}));
export const MONEY_SETTINGS_EXPLANATION = 'How willing you are to spend, in five stops. A stop chooses the delegation strategy, each role\'s model tier and reasoning level, and the child limits, wherever you have set none; it states no sum and stops no run. A session can hold its own stop, chosen from the composer\'s chip. Applies to runs started from now.';
export const MONEY_CHIP_DESCRIPTION = 'How willing this session is to spend. It moves only what you have not set.';
export const MONEY_LIVE_LINE = 'A run is live. This move reaches only agents delegated from now; everything else applies from the next run.';
const NO_DELEGATION = 'No agent is delegated: a single run works alone.';

export function moneyStopIndex(stop: MoneyStop): number {
  return MONEY_STOPS.indexOf(stop);
}

/** The chip's tooltip (§6): the stop and its sentence, and whether the session follows the default. */
export function moneyChipTitle(stop: MoneyStop, following: boolean): string {
  return `Money slider: ${MONEY_STOP_LABELS[stop]}${following ? ', the default' : ''}. ${MONEY_STOP_SENTENCES[stop]}`;
}

const SET_WORDS: Readonly<Record<LeverOrigin, string>> = {
  workspace: 'Set for this workspace; no stop moves it',
  global: 'Set in your global configuration; no stop moves it',
  session: 'Chosen for this session; no stop moves it',
  default: '',
  discovered: '',
};
function originOf(origin: LeverOrigin): ValueOrigin {
  return origin === 'workspace' || origin === 'global' || origin === 'session' ? origin : 'default';
}

type LeverKind = 'tier' | 'level' | 'limits' | 'strategy';
/** One mark line under a value: moved, set, or "stays: <reason>"; an unchanged value carries none. */
export function markText(mark: LeverMark | null, kind: LeverKind): { visible: string; name: string } | null {
  if (mark === null) return null;
  if (mark.kind === 'set') return { visible: 'set', name: SET_WORDS[mark.origin] };
  if (mark.kind === 'stays') return { visible: `stays: ${mark.reason}`, name: `Stays: ${mark.reason}` };
  const from = mark.from;
  if (kind === 'tier') return { visible: `from ${from}`, name: `One tier ${mark.direction === 'down' ? 'lower' : 'higher'}, from ${from}` };
  if (kind === 'level') return { visible: `from ${from}`, name: `One reasoning level ${mark.direction === 'down' ? 'lower' : 'higher'}, from ${from}` };
  return { visible: `from ${from}`, name: `Moved by this stop, from ${from}` };
}

function Mark({ mark, kind, slots }: { readonly mark: LeverMark | null; readonly kind: LeverKind; readonly slots?: MoneyLevers['slots'] | undefined }) {
  // A tier step names the model it moved from, as the Model column names models: the slot's key where the alias has one.
  const from = mark?.kind === 'moved' && kind === 'tier' && slots !== undefined && mark.from in slots ? slots[mark.from as keyof MoneyLevers['slots']] : null;
  const text = markText(mark !== null && mark.kind === 'moved' && from !== null ? { ...mark, from } : mark, kind);
  if (mark === null || text === null) return null;
  if (mark.kind === 'set') {
    return <span className="money-mark" data-mark="set"><Origin of={originOf(mark.origin)} words={text.name} /><span aria-hidden="true">{text.visible}</span></span>;
  }
  const glyph = mark.kind === 'moved' ? (mark.direction === 'down' ? 'ph-arrow-down' : 'ph-arrow-up') : null;
  return (
    <span className="money-mark" data-mark={mark.kind} role="img" aria-label={text.name} title={text.name}>
      {glyph === null ? null : <i className={`ph ${glyph}`} aria-hidden="true" />}
      <span aria-hidden="true">{text.visible}</span>
    </span>
  );
}

/** The preview's role rows: the entry role on its own, the rest grouped by identical result, every role named (§3). */
export interface RoleGroup {
  readonly roles: readonly string[];
  readonly entry: boolean;
  readonly result: RoleResult;
}
function sameResult(a: RoleResult, b: RoleResult): boolean {
  return a.modelKey === b.modelKey && a.model.value === b.model.value && a.thinking.value === b.thinking.value
    && JSON.stringify(a.model.mark) === JSON.stringify(b.model.mark) && JSON.stringify(a.thinking.mark) === JSON.stringify(b.thinking.mark)
    && a.offered.length === b.offered.length;
}
export function roleGroups(resolution: MoneyResolution): readonly RoleGroup[] {
  const groups: { roles: string[]; entry: boolean; result: RoleResult }[] = [];
  const entry = resolution.roles.find((r) => r.entry);
  if (entry) groups.push({ roles: [entry.role], entry: true, result: entry });
  for (const role of resolution.roles) {
    if (role.entry) continue;
    const same = groups.find((g) => !g.entry && sameResult(g.result, role));
    if (same) same.roles.push(role.role);
    else groups.push({ roles: [role.role], entry: false, result: role });
  }
  return groups;
}

function levelText(thinking: LeverResult<string | null>, offered: readonly string[]): { text: string; none: boolean } {
  if (offered.length === 0) return { text: 'none', none: true };
  return { text: thinking.value ?? 'default', none: false };
}

export interface MoneyPreviewProps {
  readonly resolution: MoneyResolution;
  /** The tier slots' models, so a moved model is named as the Model column names it. */
  readonly slots?: MoneyLevers['slots'] | undefined;
  /** The stop under the pointer, where it is not the chosen one. */
  readonly pointed: boolean;
  readonly ruleId: string;
}

/** The preview (§3): the title, the rule line, Strategy and Child limits, and the role table. */
export function MoneyPreview({ resolution, slots, pointed, ruleId }: MoneyPreviewProps) {
  const rule = resolution.allSet ? MONEY_RULE_ALL_SET : resolution.rule;
  const limits = resolution.limits;
  const limitsMark = limits === null ? null : [limits.maxActive.mark, limits.maxDepth.mark, limits.maxTotal.mark].find((m) => m?.kind === 'moved')
    ?? [limits.maxActive.mark, limits.maxTotal.mark].find((m) => m !== null) ?? null;
  // The limits a stop moves are the two counts; depth is never moved (PD-ORCH-019 clause 4), so the mark names those two.
  const was = (l: LeverResult<number>): string => (l.mark?.kind === 'moved' ? l.mark.from : String(l.value));
  const limitsFrom: LeverMark | null = limitsMark?.kind === 'moved' && limits !== null
    ? { kind: 'moved', direction: limitsMark.direction, from: `${was(limits.maxActive)} at once · ${was(limits.maxTotal)} in all` }
    : limitsMark;
  const groups = roleGroups(resolution);
  const strategy = resolution.strategy;
  return (
    <section className="money-preview" aria-labelledby={`${ruleId}-title`} data-ui="money-preview" data-testid="money-preview">
      <h3 id={`${ruleId}-title`} className="money-preview__title">
        Next run{pointed ? <span className="money-preview__if">, if you choose {MONEY_STOP_LABELS[resolution.stop]}</span> : null}
      </h3>
      {rule === null ? null : <p id={ruleId} className="money-preview__rule" data-testid="money-rule">{rule}</p>}
      <DesignTable className="money-preview__table">
        <colgroup><col className="money-preview__col-role" /><col /></colgroup>
        <tbody>
          <tr className="money-preview__fact">
            <th scope="row">Strategy</th>
            <td><span className="money-value">{STRATEGY_LABELS[strategy.value]}</span><Mark mark={strategy.mark} kind="strategy" /></td>
          </tr>
          <tr className="money-preview__fact">
            <th scope="row">Child limits</th>
            <td>
              {limits === null
                ? <span className="money-value" data-none="">none: nothing is delegated</span>
                : <><span className="money-value">{childLimitsLabel(limits)}</span><Mark mark={limitsFrom} kind="limits" /></>}
            </td>
          </tr>
        </tbody>
      </DesignTable>
      {strategy.value === 'single'
        ? <p className="money-preview__rule money-preview__empty">{NO_DELEGATION}</p>
        : (
          <DesignTable className="money-preview__table" data-testid="money-roles">
            <colgroup><col className="money-preview__col-role" /><col className="money-preview__col-model" /><col /></colgroup>
            <thead><tr><th scope="col">Role</th><th scope="col">Model</th><th scope="col">Reasoning level</th></tr></thead>
            <tbody>
              {groups.map((g) => {
                const level = levelText(g.result.thinking, g.result.offered);
                const model = g.result.modelKey ?? g.result.model.value;
                return (
                  <tr key={g.roles.join(',')} className="money-preview__group" data-entry={g.entry ? '' : undefined}>
                    <th scope="row">
                      <span className="money-role">{g.roles.map((r, i) => <Fragment key={r}><span className="money-role__name">{r}{i < g.roles.length - 1 ? ',' : ''}</span>{i < g.roles.length - 1 ? ' ' : ''}</Fragment>)}</span>
                      {g.entry ? <span className="money-role__note">entry role</span> : null}
                    </th>
                    <td><span className="money-value" title={model}>{model}</span><Mark mark={g.result.model.mark} kind="tier" slots={slots} /></td>
                    <td>
                      <span className="money-value" data-none={level.none ? '' : undefined} title={level.none ? 'This model offers no reasoning levels; no stop changes it.' : undefined}>{level.text}</span>
                      <Mark mark={g.result.thinking.mark} kind="level" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DesignTable>
        )}
    </section>
  );
}

export interface MoneyChipProps {
  /** The session's stop, else the default's. */
  readonly stop: MoneyStop;
  /** True where the session holds no stop of its own and follows the default. */
  readonly following: boolean;
  readonly defaultStop: MoneyStop;
  /** The snapshot's levers; null where the configuration has not been read (the preview then says so). */
  readonly levers: MoneyLevers | null;
  /** A run is under way (clause 10's live line). */
  readonly live: boolean;
  readonly onChoose: (stop: MoneyStop) => void;
  readonly onOpenDefault: () => void;
}

/**
 * The composer's chip (§9): `StripMenuButton`'s shell in a `strip-control`, after the reasoning chip, enabled in every run
 * state (clause 10), warning ink at the two upper stops; its panel the `PopoverPanel` holding the slider and the preview.
 */
export function MoneyChip({ stop, following, defaultStop, levers, live, onChoose, onOpenDefault }: MoneyChipProps) {
  const range = useRef<HTMLInputElement>(null);
  // A choice shows at once; the record confirms it, and a record that changes for any reason replaces it.
  const [pending, setPending] = useState<{ readonly stop: MoneyStop; readonly over: string } | null>(null);
  const record = `${stop}/${String(following)}`;
  const held = pending !== null && pending.over === record ? pending.stop : null;
  const shownStop = held ?? stop;
  const followsDefault = following && held === null;
  const resolutions = useMemo(() => (levers === null ? null : MONEY_STOPS.map((s) => resolveMoneyStop(levers, s))), [levers]);
  const choose = (index: number) => {
    const next = MONEY_STOPS[index];
    if (next === undefined || next === shownStop) return;
    setPending({ stop: next, over: record });
    onChoose(next);
  };
  const warn = isWarningStop(shownStop);
  return (
    <div className="strip-control" data-testid="chip-money" data-ui="money-chip">
      <span id="chip-money-description" className="visually-hidden">{MONEY_CHIP_DESCRIPTION}</span>
      <PopoverPanel icon="ph-coins" value={MONEY_STOP_LABELS[shownStop]} ariaLabel="Money slider" aria-describedby="chip-money-description"
        title={moneyChipTitle(shownStop, followsDefault)} tone={warn ? 'warn' : undefined}
        initialFocus={range} panelClassName="money-panel" panelTestId="money-panel">
        {(close) => (
          <>
            <div className="popover-panel__head">
              <h2 className="popover-panel__title">Money slider</h2>
              <span className="popover-panel__aside">{followsDefault ? 'Follows the default' : 'This session'} ·</span>
              <DesignButton type="button" className="btn btn-link popover-panel__link" aria-label={`Default: ${MONEY_STOP_LABELS[defaultStop]}. Open Settings › Delegation`}
                onClick={() => { close(false); onOpenDefault(); }}>Default: {MONEY_STOP_LABELS[defaultStop]}</DesignButton>
            </div>
            {live ? <p id="money-live" className="money-live" role="status"><i className="ph ph-info" aria-hidden="true" />{MONEY_LIVE_LINE}</p> : null}
            <StepSlider ref={range} id="money-slider" className="money-slider" aria-label="Money slider for this session"
              aria-describedby={[resolutions?.[moneyStopIndex(shownStop)]?.rule ? 'money-rule' : '', live ? 'money-live' : ''].filter(Boolean).join(' ')}
              steps={MONEY_SLIDER_STEPS} value={moneyStopIndex(shownStop)} onChange={choose}
              renderShown={(index, pointed) => {
                const resolution = resolutions?.[index];
                if (resolution === undefined) return <p className="money-preview__rule" data-testid="money-preview">Reading the models…</p>;
                return <MoneyPreview resolution={resolution} slots={levers?.slots} pointed={pointed} ruleId={pointed ? 'money-rule-pointed' : 'money-rule'} />;
              }} />
          </>
        )}
      </PopoverPanel>
    </div>
  );
}
