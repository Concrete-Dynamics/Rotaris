import {
  useCallback, useEffect, useId, useLayoutEffect, useRef, useState,
  type ButtonHTMLAttributes, type ReactNode, type RefObject,
} from 'react';
import { classes } from './shared.js';

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
}

/** `true` when the point is outside the element's rect — the outside-press test. */
function pointOutside(el: Element, x: number, y: number): boolean {
  const r = el.getBoundingClientRect();
  return x < r.left || x > r.right || y < r.top || y > r.bottom;
}

export function PopoverMenu({ value, icon, ariaLabel, options, onChoose, className, disabled, title, anchorRef, ...rest }: PopoverMenuTriggerProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const trigger = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [box, setBox] = useState<{ left: number; bottom: number; minWidth: number } | null>(null);
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
      setBox({ left: r.left, bottom: window.innerHeight - r.bottom, minWidth: r.width });
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
        className={classes('chip-menu', open && 'is-open', className)}
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
        <span className="chip-menu__value">{value}</span>
        <i className="ph ph-caret-down chip-menu__caret" aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={panel}
          className="chip-menu__panel"
          role="menu"
          aria-label={ariaLabel}
          id={listId}
          style={box ? { left: box.left, bottom: box.bottom, minWidth: box.minWidth } : undefined}
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
