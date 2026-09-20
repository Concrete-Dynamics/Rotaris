import {
  useCallback, useEffect, useId, useLayoutEffect, useRef, useState,
  type ButtonHTMLAttributes, type ReactNode, type RefObject,
} from 'react';
import { classes } from './shared.js';
import { panelPlacement, type PanelBox } from './panel-placement.js';

/**
 * The design-system press-revealed popover menu (PD-CHAT-001): a value chip whose alternatives
 * open in a small panel anchored to it, rather than an always-expanded selector.
 *
 * Beside it the composer's docked-strip shells (PD-CHAT-001 revision 2, R-040 choice B) live in
 * this module because the strip's menus ARE these two pickers' panels: an icon-led control for
 * the strip that shares the composer's own outer contour — persona, model, reasoning, run-start
 * mode, permission mode, attach, stash, steer, pause. The value reads beside the icon; the
 * spec-fixed wording rides as the accessible name (PD-CHAT-001's icon clause). Small fixed sets
 * render their value through a label map (e.g. reasoning `medium` → `Medium`); long lists keep
 * the bare identifier, which is their `SearchableSelect` value unchanged.
 *
 * Two shells exist for one strip and one reason: a control that OPENS alternatives (persona,
 * model, reasoning, run-start, permission mode) renders `StripMenuButton`, a bare press-revealed
 * trigger whose panel is the wrapped picker's own (nothing here invents a second popover); a
 * control that ACTS (attach, stash, steer, pause, stop, send) renders `StripActionButton`, a bare
 * borderless press. The strip owns the contour and the 34 px band; neither button draws a border
 * or a background at rest, so the two shells read as one toolbar.
 */
export interface StripMenuButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'value' | 'aria-label'> {
  /** Phosphor class for the leading icon (e.g. `ph-brain`). */
  readonly icon: string;
  /** The current value, read beside the icon. */
  readonly value: string;
  /** Accessible name of the control — the spec-fixed wording rides here, not as visible copy. Strip callers pass the DOM `aria-label`; the shell maps it. */
  readonly ariaLabel?: string | undefined;
  readonly 'aria-label'?: string | undefined;
  readonly onClick?: ((e: React.MouseEvent<HTMLButtonElement>) => void) | undefined;
}

/** REQ-CHAT-006/007 govern unchanged: a disabled strip control carries its reason through both channels. */
export function StripMenuButton({ icon, value, ariaLabel, className, disabled, title, children, onClick, ...rest }: StripMenuButtonProps) {
  const name = ariaLabel ?? rest['aria-label'];
  return (
    <button
      type="button"
      className={classes('strip-btn', className)}
      aria-label={name}
      aria-describedby={rest['aria-describedby']}
      disabled={disabled}
      aria-disabled={disabled}
      title={title}
      data-ui-component="StripMenuButton"
      data-value={value}
      onClick={onClick}
      {...rest}
    >
      <i className={classes('ph', icon)} aria-hidden="true" />
      <span className="strip-btn__value">{value}</span>
      {children}
    </button>
  );
}

export interface StripActionButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'aria-label'> {
  /** Phosphor class for the icon (e.g. `ph-paperclip`). */
  readonly icon: string;
  /** Accessible name of the control. Strip callers pass the DOM `aria-label`; the shell maps it. */
  readonly ariaLabel?: string | undefined;
  readonly 'aria-label'?: string | undefined;
  readonly onClick?: ((e: React.MouseEvent<HTMLButtonElement>) => void) | undefined;
}

/** A strip control that acts rather than opens — attach, stash, steer, pause. */
export function StripActionButton({ icon, ariaLabel, className, children, onClick, ...rest }: StripActionButtonProps) {
  const name = ariaLabel ?? rest['aria-label'];
  return (
    <button
      type="button"
      className={classes('strip-btn', className)}
      aria-label={name}
      aria-describedby={rest['aria-describedby']}
      data-ui-component="StripActionButton"
      onClick={onClick}
      {...rest}
    >
      <i className={classes('ph', icon)} aria-hidden="true" />
      {children}
    </button>
  );
}

/**
 * The design-system press-revealed popover menu (PD-CHAT-001): a value chip whose alternatives
 * open in a small panel anchored to it, rather than an always-expanded selector.
 *
 * Craft is the slash popup's (`shell.css` `.slash-popup`): `--rt-surface` ground, hairline border,
 * `--rt-shadow-lg` (a shadow only ever means *this floats*), `--rt-radius-lg`, the `rt-rise`
 * entrance. The active option is `--rt-accent-tint-14` + `--rt-accent-200` (docs/design/README.md
 * §1.2, per UIR-005).
 *
 * Accessibility: the trigger carries `aria-haspopup="menu"` and `aria-expanded`; the panel is
 * `role="menu"` with `menuitemradio` options (one selection, checkable). Arrow keys move, Enter and
 * Space choose, Escape closes and returns focus to the trigger, Home/End jump, Tab closes without
 * choosing. Outside press closes. The panel never takes focus on open — the trigger keeps it and
 * acts as the menu's keyboard anchor, which is the pattern the slash popup already established.
 */

export interface MenuOption {
  readonly value: string;
  /** Visible row text. */
  readonly label: string;
  /** Optional secondary text after the label (e.g. "Default"). */
  readonly hint?: string | undefined;
  readonly disabled?: boolean;
}

export interface PopoverMenuTriggerProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'value'> {
  /** The current value, shown as the chip's text beside its icon. */
  readonly value: string;
  /** Phosphor class for the leading icon (e.g. `ph-brain`). */
  readonly icon?: string;
  /** Accessible name of the control — the spec-fixed wording rides here, not as visible copy. */
  readonly ariaLabel: string;
  readonly options: readonly MenuOption[];
  readonly onChoose: (value: string) => void;
  /** Rendered beside the trigger while open (rare; the confirm dialogs render their own). */
  readonly children?: ReactNode;
  /** Anchor ref for tests and callers that need the trigger element. */
  readonly anchorRef?: RefObject<HTMLButtonElement | null> | undefined;
  /**
   * PD-CHAT-001 revision 2 (the composer's docked strip, R-040 choice B): render the trigger as
   * the strip's borderless icon-led shell instead of the bordered value chip. The panel, the
   * options, the values and the callback are untouched — only the trigger's shell changes.
   * A fixed small set passes its display map here (reasoning `medium` → `Medium`).
   *
   * PD-CHAT-001 revision 3 (the compact strip, R-041): `iconOnly` hides the trigger's own value
   * text and caret behind the strip's `data-compact` state instead of unmounting it — the panel
   * still announces the current choice with its check mark, and the tooltip still names value and
   * choice. The span stays mounted (with the value as its text) so the established `text` probes
   * keep reading the control they always read; CSS hides it. Never a second source: `triggerText`
   * below is the only text either shell draws.
   */
  readonly strip?: { readonly labels?: Readonly<Record<string, string>> | undefined; readonly iconOnly?: boolean | undefined } | undefined;
}

/** `true` when the point is outside the element's rect — the outside-press test. */
function pointOutside(el: Element, x: number, y: number): boolean {
  const r = el.getBoundingClientRect();
  return x < r.left || x > r.right || y < r.top || y > r.bottom;
}

export function PopoverMenu({ value, icon, ariaLabel, options, onChoose, className, disabled, title, anchorRef, strip, ...rest }: PopoverMenuTriggerProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const trigger = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [box, setBox] = useState<PanelBox | null>(null);
  const setTrigger = (el: HTMLButtonElement | null) => {
    trigger.current = el;
    if (anchorRef !== undefined) anchorRef.current = el;
  };

  // Re-anchor on open, on resize and on any layout change of the trigger (the composer scrolls).
  useLayoutEffect(() => {
    if (!open) return;
    const field = trigger.current;
    if (!field) return;
    const measure = () => {
      const r = field.getBoundingClientRect();
      setBox(panelPlacement(
        { left: r.left, bottom: r.bottom, width: r.width },
        { width: window.innerWidth, height: window.innerHeight },
      ));
    };
    measure();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null;
    observer?.observe(field);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [open]);

  // Keep the highlighted row (not necessarily the chosen one) in view while arrows move.
  useEffect(() => {
    if (!open) return;
    const row = panel.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }, []);

  // Outside press closes without stealing focus back.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = trigger.current;
      const p = panel.current;
      if (!p) return;
      if (e.target instanceof Node && p.contains(e.target)) return;
      if (t && e.target instanceof Node && t.contains(e.target)) return;
      if (e.target instanceof Element && t && pointOutside(t, e.clientX, e.clientY)) close(false);
      else if (e.target instanceof Node && !t?.contains(e.target)) close(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open, close]);

  const currentIndex = Math.max(0, options.findIndex((o) => o.value === value));
  /** The strip shell reads the display map over the SAME value the chip shows — never a second source. */
  const triggerText = strip?.labels !== undefined && strip.labels[value] !== undefined ? strip.labels[value]! : value;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
        setActive(currentIndex);
      }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
    if (e.key === 'Tab') { close(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); return; }
    if (e.key === 'Home') { e.preventDefault(); setActive(0); return; }
    if (e.key === 'End') { e.preventDefault(); setActive(options.length - 1); return; }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const option = options[active];
      if (option && !option.disabled) { close(true); onChoose(option.value); }
    }
  };

  return (
    <>
      <button
        ref={setTrigger}
        type="button"
        className={strip === undefined ? classes('chip-menu', open && 'is-open', className) : classes('strip-btn', open && 'is-open', className)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        disabled={disabled}
        aria-disabled={disabled}
        title={title}
        data-ui-component="PopoverMenu"
        data-value={value}
        data-open={open ? '1' : '0'}
        onKeyDown={onKeyDown}
        onClick={() => { if (open) close(true); else { setOpen(true); setActive(currentIndex); } }}
        {...rest}
      >
        {icon !== undefined && <i className={classes('ph', icon)} aria-hidden="true" />}
        <span className={strip === undefined ? 'chip-menu__value' : 'strip-btn__value'}>{triggerText}</span>
        <i className={strip === undefined ? classes('ph', 'ph-caret-down', 'chip-menu__caret') : classes('ph', 'ph-caret-down', 'strip-btn__caret')} aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={panel}
          className="chip-menu__panel"
          role="menu"
          aria-label={ariaLabel}
          id={listId}
          style={box ? { left: box.left, ...(box.top !== undefined ? { top: box.top } : { bottom: box.bottom }), minWidth: box.minWidth, maxHeight: box.maxHeight } : undefined}
          data-testid="chip-menu-panel"
          onKeyDown={onKeyDown}
        >
          {options.map((o, i) => (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={o.value === value}
              aria-disabled={o.disabled}
              id={`${listId}-${i}`}
              data-index={i}
              className={classes('chip-menu__item', i === active && 'is-active', o.value === value && 'is-chosen', o.disabled && 'is-disabled')}
              onMouseEnter={() => setActive(i)}
              onClick={() => { if (!o.disabled) { close(true); onChoose(o.value); } }}
            >
              <span className="chip-menu__check" aria-hidden="true">{o.value === value ? <i className="ph ph-check" /> : null}</span>
              <span className="chip-menu__label">{o.label}</span>
              {o.hint !== undefined && <span className="chip-menu__hint">{o.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </>
  );
}
