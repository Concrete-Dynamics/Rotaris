import {
  useEffect, useId, useLayoutEffect, useRef, useState,
  type ButtonHTMLAttributes, type ReactNode,
} from 'react';
import { layoutContractAttributes, type UiLayoutContract } from './layout-contract.js';
import { classes } from './shared.js';
import { FILTER_DEBOUNCE_MS, useDebouncedValue } from './use-debounced-value.js';

/**
 * The searchable model picker (REQ-CONFIG-427..433): a combobox whose filter narrows a long
 * model list the native select cannot reach without scrolling through all of it.
 *
 * Contract, taken from the command palette's (`packages/ui/src/commands/CommandPalette.tsx`):
 * the filter field is `role="combobox"` with `aria-autocomplete="list"`, `aria-expanded`,
 * `aria-controls` and `aria-activedescendant`; the results are `role="listbox"` with
 * `role="option"` rows. Up/Down move, Enter chooses, Escape closes without choosing, Home/End
 * jump, Tab closes without choosing. The first row is auto-selected whenever results exist.
 * Outside press closes without choosing. The filter field takes focus on open (R-038) —
 * the point of the picker is to type at once — while the trigger takes it back on close,
 * which is the pattern the slash popup already established.
 *
 * Craft is the slash popup's (`shell.css` `.slash-popup`): `--rt-surface` ground, hairline
 * border, `--rt-shadow-lg`, `--rt-radius-lg`, the `rt-rise` entrance. The active row is
 * `--rt-accent-tint-14` + `--rt-accent-200` (docs/design/README.md §1.2, per UIR-005).
 *
 * Value discipline is the native select's: `value` is the bare model identifier and `onChange`
 * receives that identifier, never display text (REQ-CONFIG-432). The empty option (Inherited /
 * Unset / Leave as configured) is the first row and participates in filtering like any other.
 * An unavailable model (REQ-CONFIG-428/429) is listed, greyed and unselectable, never dropped:
 * its row is `aria-disabled`, skipped by keyboard movement and Enter, with the reason as its
 * tooltip and accessible description, the label suffixed in words, and a distinct foreground
 * colour — the four channels REQ-CONFIG-429 fixes, colour never alone.
 */

export interface SearchableOption {
  readonly value: string;
  /** The bare identifier as the data slot carries it; the visible row text. */
  readonly label: string;
  /** REQ-CONFIG-429: the reason sentence resolved once at load (REQ-CONFIG-208). Absent means usable. */
  readonly unavailableReason?: string | undefined;
  /**
   * The word joining the label to the reason on an unavailable row (default `unavailable`).
   * The Inspector's withheld models (REQ-MONITOR-067) pass `withheld: <reason>`'s head word here,
   * so one unselectable-row path serves both vocabularies.
   */
  readonly suffix?: string | undefined;
  /** Optional secondary text after the label (e.g. the effective model an Inherited row resolves to). */
  readonly hint?: string | undefined;
}

export interface SearchableSelectProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'value'> {
  /** The bare identifier currently chosen, or `''` for the empty option. */
  readonly value: string;
  readonly options: readonly SearchableOption[];
  /** Accessible name of the control — the spec-fixed wording rides here, not as visible copy. */
  readonly ariaLabel: string;
  readonly onChange: (value: string) => void;
  /** Placeholder of the filter field (default `Filter models…`). */
  readonly filterPlaceholder?: string | undefined;
  /** Empty-list sentence (default `No matching model.`); persona lists pass their own noun. */
  readonly emptyText?: string | undefined;
  readonly ui?: UiLayoutContract;
  readonly children?: ReactNode;
  /**
   * PD-CHAT-001 revision 2 (the composer's docked strip, R-040 choice B): render the trigger as
   * the strip's borderless icon-led shell instead of the bordered value chip. The panel, the
   * filter, the options, the values and the callbacks are untouched — only the trigger's shell
   * changes, so a strip control and a chip control are the same picker wearing two shells.
   * The shell's `value` is the same `chosenText` the chip shows; `icon` is the strip's leading
   * glyph. A fixed small set passes its display map here (reasoning `medium` → `Medium`).
   *
   * PD-CHAT-001 revision 3 (the compact strip, R-041): `iconOnly` hides the trigger's own value
   * text and caret behind the strip's `data-compact` state instead of unmounting it — the panel
   * still lists every option with the current choice checked, and the tooltip still names value
   * and choice. The span stays mounted (with the value as its text) so the established `text`
   * probes keep reading the control they always read; CSS hides it. Never a second source:
   * `triggerText` below is the only text either shell draws.
   */
  readonly strip?: { readonly icon: string; readonly labels?: Readonly<Record<string, string>> | undefined; readonly iconOnly?: boolean | undefined } | undefined;
}

export const SEARCHABLE_SELECT_MAX_ROWS = 8;

/** Case-insensitive substring over the bare identifier; order is the caller's (REQ-CONFIG-339's slot-first order survives). */
export function filterSearchableOptions(options: readonly SearchableOption[], query: string): readonly SearchableOption[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return options;
  return options.filter((o) => o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle));
}

function rowSuffix(option: SearchableOption): string {
  if (option.unavailableReason === undefined) return option.label;
  return `${option.label} — ${option.suffix ?? 'unavailable'}`;
}

export function SearchableSelect({ value, options, ariaLabel, onChange, filterPlaceholder = 'Filter models…', emptyText = 'No matching model.', className, disabled, title, ui, children, strip, ...rest }: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, FILTER_DEBOUNCE_MS);
  const filtered = filterSearchableOptions(options, debounced);
  const [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [box, setBox] = useState<{ left: number; bottom: number; minWidth: number } | null>(null);

  const chosen = options.find((o) => o.value === value);
  const chosenText = chosen === undefined ? value : rowSuffix(chosen);
  /** The strip shell reads the display map over the SAME text the chip shows — never a second source. */
  const triggerText = strip?.labels !== undefined && strip.labels[chosenText] !== undefined ? strip.labels[chosenText]! : chosenText;

  // The highlight is a pure function of the narrowed list, derived during render rather than
  // synchronized in an effect: no cascading render is needed to keep it in step with the filter.
  // Skips rows no keyboard act may land on (REQ-CONFIG-428: unavailable, never dropped, never chosen).
  const firstUsable = filtered.findIndex((o) => o.unavailableReason === undefined);
  const effectiveActive = filtered.length === 0 ? 0 : filtered[active]?.unavailableReason === undefined ? active : Math.max(0, firstUsable);

  const openWith = () => {
    setOpen(true);
    setQuery('');
    const index = Math.max(0, filtered.findIndex((o) => o.value === value && o.unavailableReason === undefined));
    setActive(index);
    // The point of the picker is to type at once: focus lands in the filter on open (R-038).
    requestAnimationFrame(() => input.current?.focus());
  };

  const close = (refocus: boolean) => {
    setOpen(false);
    setQuery('');
    if (refocus) trigger.current?.focus();
  };

  // Re-anchor on open, on resize and on any layout change of the trigger (the settings grid scrolls).
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
  }, [open ]);

  // Keep the highlighted row in view while arrows move.
  useEffect(() => {
    if (!open) return;
    const row = panel.current?.querySelector<HTMLElement>(`[data-index="${effectiveActive}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [effectiveActive, open]);

  // Outside press closes without choosing and without stealing focus back.
  // `close` is intentionally unmemoized (the compiler owns memoization here): it only
  // touches open/query state and trigger focus, so a fresh identity per render is correct.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = trigger.current;
      const p = panel.current;
      if (!p) return;
      if (e.target instanceof Node && (p.contains(e.target) || t?.contains(e.target))) return;
      close(false);
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  const move = (delta: 1 | -1) => {
    if (filtered.length === 0) return;
    setActive((a) => {
      let next = a;
      for (let step = 0; step < filtered.length; step += 1) {
        next = (next + delta + filtered.length) % filtered.length;
        if (filtered[next]?.unavailableReason === undefined) return next;
      }
      return a;
    });
  };

  const choose = (index: number) => {
    const option = filtered[index];
    if (option === undefined || option.unavailableReason !== undefined) return;
    close(true);
    if (option.value !== value) onChange(option.value);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openWith();
      }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
    if (e.key === 'Tab') { close(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); return; }
    if (e.key === 'Home') { e.preventDefault(); setActive(Math.max(0, filtered.findIndex((o) => o.unavailableReason === undefined))); return; }
    if (e.key === 'End') {
      e.preventDefault();
      for (let i = filtered.length - 1; i >= 0; i -= 1) {
        if (filtered[i]?.unavailableReason === undefined) { setActive(i); return; }
      }
      return;
    }
    if (e.key === 'Enter') { e.preventDefault(); choose(effectiveActive); }
  };

  const activeRowId = filtered.length === 0 ? undefined : `${listId}-${effectiveActive}`;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={strip === undefined ? classes('chip-menu', 'searchable-select', open && 'is-open', className) : classes('strip-btn', open && 'is-open', className)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-activedescendant={open ? activeRowId : undefined}
        disabled={disabled}
        aria-disabled={disabled}
        title={title ?? (chosen?.unavailableReason ?? undefined)}
        aria-description={chosen?.unavailableReason ?? undefined}
        data-ui-component="SearchableSelect"
        data-value={value}
        data-open={open ? '1' : '0'}
        onKeyDown={onKeyDown}
        onClick={() => { if (open) close(true); else openWith(); }}
        {...layoutContractAttributes(ui)}
        {...rest}
      >
        {strip !== undefined && <i className={classes('ph', strip.icon)} aria-hidden="true" />}
        <span className={strip === undefined ? 'chip-menu__value' : 'strip-btn__value'}>{triggerText}</span>
        <i className={strip === undefined ? classes('ph', 'ph-caret-down', 'chip-menu__caret') : classes('ph', 'ph-caret-down', 'strip-btn__caret')} aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={panel}
          className="chip-menu__panel searchable-select__panel"
          role="presentation"
          id={`${listId}-panel`}
          style={box ? { left: box.left, bottom: box.bottom, minWidth: box.minWidth } : undefined}
          data-testid="searchable-select-panel"
          onKeyDown={onKeyDown}
        >
          <div className="searchable-select__filter">
            <i className="ph ph-magnifying-glass" aria-hidden="true" />
            <input
              ref={input}
              type="text"
              role="combobox"
              className="input searchable-select__input"
              aria-label={`${ariaLabel} filter`}
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={activeRowId}
              placeholder={filterPlaceholder}
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              data-testid="searchable-select-filter"
            />
          </div>
          <div ref={undefined} className="searchable-select__list" role="listbox" aria-label={ariaLabel} id={listId} data-testid="searchable-select-list">
            {filtered.map((o) => {
              const index = filtered.indexOf(o);
              const unavailable = o.unavailableReason !== undefined;
              return (
                <div
                  key={o.value}
                  role="option"
                  aria-selected={o.value === value}
                  aria-disabled={unavailable}
                  aria-description={o.unavailableReason ?? undefined}
                  title={o.unavailableReason ?? undefined}
                  id={`${listId}-${index}`}
                  data-index={index}
                  data-value={o.value}
                  className={classes('chip-menu__item', 'searchable-select__option', index === effectiveActive && 'is-active', o.value === value && 'is-chosen', unavailable && 'is-disabled')}
                  onMouseEnter={() => { if (!unavailable) setActive(index); }}
                  onClick={() => choose(index)}
                >
                  {unavailable && <i className="ph ph-warning-circle chip-menu__icon" aria-hidden="true" />}
                  <span className="chip-menu__label">{rowSuffix(o)}</span>
                  {o.hint !== undefined && <span className="chip-menu__hint">{o.hint}</span>}
                </div>
              );
            })}
            {filtered.length === 0 && <div className="cmdk-empty text-secondary" role="presentation" data-testid="searchable-select-empty">{emptyText}</div>}
          </div>
          {children}
        </div>
      )}
    </>
  );
}
