import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { NoticeAction, UpdateState } from '@rotaris/contracts';
import { Button as DesignButton, layoutContractAttributes, type UiLayoutContract } from './design-system/index.js';
import { useShellState } from './shell-state.js';

/**
 * PD-SHELL-018 (R-117; UD-10 of PD-STARTUP-008) — the title bar's update indicator, R2 and its action R3 of
 * `docs/design/briefs/title-bar-and-rail.md`.
 *
 * Present while a download of REQ-STARTUP-169 runs (`downloading`) and while a verified pending update waits (`ready`),
 * absent at every other time, whatever notice holds the banner. Downloading, it conveys the version and REQ-STARTUP-118's
 * measured figure and offers the cancel (REQ-STARTUP-170); ready, that the version is ready, with `Restart now` behind
 * REQ-STARTUP-174's guards — main asks them, this control only dispatches the same action member the notice carries
 * (REQ-SHELL-115: one identifier, one result from either place). It takes no focus and opens nothing on its own.
 *
 * Its words are the brief's §6 and §7; its drawing §8: bare text in secondary ink at the bar's small step, the figure in
 * the mono face, colour only on the icon (`--rt-run` downloading, `--rt-done` ready), the action a compact ghost button —
 * no box, no fill, no motion. It is not a live region for its figure (a percent repainted per whole number would be
 * announced up to a hundred times); a phase change is announced through one visually hidden status, and only while the
 * update notice is not the current notice (`noticeId` against `currentNoticeId`), since otherwise the banner says it.
 *
 * Give-way (§8), measured against the bar's free width and never a written breakpoint: the workspace slot is what is left
 * once every other title-bar item has its natural width (its zero flex basis, `shell.css`); while it is narrower than the
 * chip's floor — the folder glyph, the furniture and `…/<last segment>` — the indicator drops its label (`compact`), then
 * its figure (`icon`), before anything else in the bar is clipped. The label and figure hidden by elision stay in the
 * description, so no fact is only where it is hidden (REQ-SHELL-058).
 */
export type UpdateIndicatorForm = 'full' | 'compact' | 'icon';

export interface UpdateIndicatorProps {
  readonly state: UpdateState;
  /** The identifier of the notice holding the banner, or null (channel 4) — for the announcement rule above. */
  readonly currentNoticeId: number | null;
  readonly onAction?: ((action: NoticeAction) => void) | undefined;
  /** The workspace chip's full path (AppShell's `workspacePath`): its last segment is the chip's floor below. */
  readonly workspacePath?: string | undefined;
}

/** §6: the visible label. */
export const updateIndicatorLabel = (state: UpdateState): string => (state.phase === 'ready' ? `${state.version ?? ''} ready` : `Downloading ${state.version ?? ''}`);

/** §7: the indicator's description, which is also its tooltip. */
export function updateIndicatorDescription(state: UpdateState): string {
  const version = state.version ?? '';
  if (state.phase === 'downloading') return `Downloading Rotaris ${version}: ${state.measured ?? ''}. You can keep working; it is verified against the published checksum when it finishes.`;
  if (state.inPlace === true) return `Rotaris ${version} has been downloaded, verified and installed. It runs the next time Rotaris starts, or now with Restart now.`;
  return `Rotaris ${version} has been downloaded and verified. It installs the next time Rotaris starts, or now with Restart now.`;
}

/** §7: R3's accessible name, description and visible label, by phase. */
export function updateIndicatorAction(state: UpdateState): { readonly name: string; readonly description: string; readonly label: string; readonly icon: string; readonly action: NoticeAction } {
  const version = state.version ?? '';
  if (state.phase === 'downloading') {
    return {
      name: 'Cancel the update download', label: 'Cancel', icon: 'ph-x', action: { kind: 'cancel-update' },
      description: `Stops the download of Rotaris ${version} and removes what it wrote. It downloads again the next time Rotaris starts.`,
    };
  }
  return {
    name: 'Restart now', label: 'Restart now', icon: 'ph-arrow-clockwise', action: { kind: 'restart' },
    description: `Restarts Rotaris to ${state.inPlace === true ? 'run' : 'install'} ${version}. You are asked first about unsaved settings, a running integration and active runs.`,
  };
}

/** §7: what the visually hidden status says on a phase change, while the banner does not. */
export const updatePhaseAnnouncement = (state: UpdateState): string => (state.phase === 'ready' ? `Rotaris ${state.version ?? ''} is ready. Restart now is in the title bar.` : `Rotaris ${state.version ?? ''} is downloading.`);

/** §8's relations: one line with its neighbour, inside the bar; the action centred on the label it serves. */
const INDICATOR_LAYOUT: UiLayoutContract = { id: 'update-indicator', relations: [{ kind: 'containment', target: 'shell-title' }, { kind: 'spacing-token', property: 'column-gap', token: '--rt-space-1' }] };
const LABEL_LAYOUT: UiLayoutContract = { id: 'update-indicator-label', relations: [{ kind: 'text-fit', axis: 'x' }] };
const ACTION_LAYOUT: UiLayoutContract = { id: 'update-action', relations: [{ kind: 'align-y', target: 'update-indicator', edge: 'middle' }, { kind: 'hit-test' }] };

const FORMS: readonly UpdateIndicatorForm[] = ['full', 'compact', 'icon'];

/**
 * The chip's floor, measured: what the chip spends beside its label plus `…/<last segment>` in its own face — the least of
 * a path REQ-WORKSPACE-149's middle shortening keeps whole. Zero where nothing can be measured (no chip, no canvas).
 */
function chipFloor(slot: HTMLElement, workspacePath: string): number {
  const chip = slot.querySelector<HTMLElement>('.title-bar__workspace');
  if (!chip) return 0;
  const path = chip.querySelector<HTMLElement>('.title-bar__workspace-path');
  // The FULL path's last segment, never the drawn label's: the label may already be shortened from the middle.
  const tail = workspacePath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? '';
  const canvas = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (!canvas) return 0;
  const style = getComputedStyle(path ?? chip);
  canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const spent = chip.getBoundingClientRect().width - (path?.getBoundingClientRect().width ?? 0);
  return Math.max(0, spent) + canvas.measureText(`…/${tail}`).width;
}

export function UpdateIndicator({ state, currentNoticeId, onAction, workspacePath = '' }: UpdateIndicatorProps) {
  const descriptionId = useId();
  const root = useRef<HTMLDivElement | null>(null);
  const [form, setForm] = useState<UpdateIndicatorForm>('full');
  /** The widths each form last stood at, so a wider form is taken back only where it fits again (no oscillation). */
  const widths = useRef<Partial<Record<UpdateIndicatorForm, number>>>({});
  const [announcement, setAnnouncement] = useState('');
  const lastPhase = useRef(state.phase);
  /** Whether focus is inside the indicator, and the bar it stands in — for the focus rule after a change (§5). */
  const focusedInside = useRef(false);
  const bar = useRef<Element | null>(null);

  const present = state.phase === 'downloading' || state.phase === 'ready';

  const remeasure = useCallback(() => {
    const element = root.current;
    const slot = element?.closest('.title-bar')?.querySelector<HTMLElement>('.title-bar__workspace-slot');
    if (!element || !slot) return;
    const own = element.getBoundingClientRect().width;
    widths.current[form] = own;
    const free = slot.clientWidth;
    const floor = chipFloor(slot, workspacePath);
    const at = FORMS.indexOf(form);
    if (free < floor && at < FORMS.length - 1) { setForm(FORMS[at + 1]!); return; }
    if (at > 0) {
      const wider = FORMS[at - 1]!;
      const widerWidth = widths.current[wider];
      // A wider form comes back only where the slot would still hold the floor with it drawn.
      if (widerWidth !== undefined && free - (widerWidth - own) >= floor) setForm(wider);
      else if (widerWidth === undefined && free > floor) setForm(wider);
    }
  }, [form, workspacePath]);

  useLayoutEffect(() => { if (present) remeasure(); }, [present, remeasure, state.phase, state.version, state.measured]);

  useLayoutEffect(() => {
    const element = root.current;
    const bar = element?.closest('.title-bar');
    if (!present || !bar || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => { remeasure(); });
    observer.observe(bar);
    const slot = bar.querySelector('.title-bar__workspace-slot');
    if (slot) observer.observe(slot);
    // The chip's floor moves with what it holds (a session name appearing, PD-SHELL-016 clause 5) while its clamped box
    // keeps its size, so a change of its text is a reason to measure again too.
    const changed = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => { remeasure(); });
    if (slot && changed) changed.observe(slot, { subtree: true, childList: true, characterData: true });
    return () => { observer.disconnect(); changed?.disconnect(); };
  }, [present, remeasure]);

  /*
   * §5 "Focus after each change" (review-ui UIR-U02): when the control that held focus goes — the indicator leaving after a
   * cancel, or its action becoming another control (UIR-U01: `Cancel` is never relabelled `Restart now` under the focus or
   * the pointer; the action is keyed by its member, so a press begun on `Cancel` cannot land on `Restart now`) — focus moves
   * to the next title-bar stop, Sessions, else the first window control, never to `body`.
   */
  // A stable ref: an inline callback is detached and attached again at every commit.
  const attach = useCallback((element: HTMLDivElement | null) => { root.current = element; if (element) bar.current = element.closest('.title-bar'); }, []);
  const actionKind = present ? updateIndicatorAction(state).action.kind : null;
  // Read when a new state reaches the store, before React draws it: whether the focus is inside now, while the control
  // holding it still stands. Focus events cannot say it (a removed control's blur is not dispatched everywhere, and none fires
  // in a window that is not focused), and React has already removed a child by the time this component's commit effects run.
  useEffect(() => useShellState.subscribe((next, previous) => {
    if (next.updateState !== previous.updateState) focusedInside.current = root.current?.contains(document.activeElement) ?? false;
  }), []);
  useLayoutEffect(() => {
    if (!focusedInside.current) return;
    const owner = root.current;
    if (owner !== null && owner.contains(document.activeElement)) return;
    focusedInside.current = false;
    const next = bar.current?.querySelector<HTMLElement>('.title-bar__sessions') ?? bar.current?.querySelector<HTMLElement>('.window-control');
    next?.focus();
  }, [actionKind]);

  // §7: a phase change is announced here only while the update notice does not hold the banner.
  useEffect(() => {
    if (state.phase === lastPhase.current) return;
    lastPhase.current = state.phase;
    const bannerSaysIt = state.noticeId === null || state.noticeId === currentNoticeId;
    setAnnouncement(present && !bannerSaysIt ? updatePhaseAnnouncement(state) : '');
  }, [state, currentNoticeId, present]);

  if (!present) return null;
  const description = updateIndicatorDescription(state);
  const action = updateIndicatorAction(state);
  const iconOnly = form === 'icon';
  return (
    <div ref={attach} className="update-indicator" data-testid="update-indicator" data-phase={state.phase} data-form={form}
      data-in-place={state.inPlace === true ? '1' : undefined} {...layoutContractAttributes(INDICATOR_LAYOUT)}>
      <span className="update-indicator__status" role="group" aria-label="Update status" aria-describedby={descriptionId} title={description}>
        <i className={`ph ${state.phase === 'ready' ? 'ph-arrow-circle-up' : 'ph-download-simple'} update-indicator__icon`} aria-hidden="true" />
        {form === 'full' && <span className="update-indicator__label" {...layoutContractAttributes(LABEL_LAYOUT)}>{updateIndicatorLabel(state)}</span>}
        {state.phase === 'downloading' && form !== 'icon' && <span className="update-indicator__figure mono">{state.measured ?? ''}</span>}
        <span className="visually-hidden" id={descriptionId}>{description}</span>
      </span>
      <DesignButton key={action.action.kind} type="button" variant="ghost" size="compact" className="update-indicator__action" data-testid="update-action"
        data-action={action.action.kind} ui={ACTION_LAYOUT} aria-label={action.name} aria-description={action.description}
        title={iconOnly ? action.description : undefined} onClick={() => onAction?.(action.action)}>
        {iconOnly ? <i className={`ph ${action.icon}`} aria-hidden="true" /> : action.label}
      </DesignButton>
      <span className="visually-hidden" role="status" data-testid="update-announcement">{announcement}</span>
    </div>
  );
}
