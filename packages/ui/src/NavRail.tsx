import type { ViewId } from '@rotaris/contracts';
import { describeWithShortcut, type KeyboardPlatform } from './commands/registry.js';

/**
 * The navigation rail, drawn with the design system's `.nav-rail` /
 * `.nav-item` classes and fed its items by the caller from REQ-SHELL-023.
 *
 * REQ-SHELL-027: one button per view, in order, icon above label.
 * REQ-SHELL-028: mutually exclusive checked state (`aria-checked` on
 * `role="radio"` inside a `role="radiogroup"` — but NOT arrow-navigable: each
 * button is its own tab stop, so `tabIndex=0` on every item and no roving
 * index); tooltip and accessible description "Open {Label}"; click, Space
 * and Return switch the view. Arrow keys are left to the browser default,
 * which for `role="radio"` would move selection — so they are swallowed.
 * REQ-SHELL-058 (Part W): where an item carries a chord, the accessible
 * description is the tooltip sentence with the platform-formatted chord in
 * parentheses; the tooltip itself stays REQ-SHELL-028's exact sentence.
 */
export interface NavRailItem {
  readonly id: ViewId;
  readonly label: string;
  readonly icon: string;
  readonly shortcut?: string | undefined;
}

export interface NavRailProps {
  readonly items: readonly NavRailItem[];
  readonly active: ViewId;
  readonly onSelect: (id: ViewId) => void;
  readonly platform?: KeyboardPlatform | undefined;
}

export function NavRail({ items, active, onSelect, platform = 'windows' }: NavRailProps) {
  return (
    <nav className="nav-rail" role="radiogroup" aria-label="Primary views">
      {items.map((it) => {
        const checked = it.id === active;
        const title = `Open ${it.label}`;
        const description = describeWithShortcut(title, it.shortcut, platform);
        return (
          <button
            key={it.id}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={it.label}
            aria-description={description}
            title={title}
            tabIndex={0}
            className={checked ? 'nav-item is-active' : 'nav-item'}
            onClick={() => onSelect(it.id)}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onSelect(it.id); }
              if (e.key.startsWith('Arrow')) e.preventDefault();
            }}
          >
            <i className={`ph ${it.icon}`} aria-hidden="true" />
            <span>{it.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
