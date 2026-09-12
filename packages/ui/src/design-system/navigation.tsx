import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { Button } from './core.js';
import { Input } from './forms.js';
import { classes } from './shared.js';

export interface TabItem { readonly value: string; readonly label: ReactNode; readonly disabled?: boolean }
export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  readonly tabs: readonly TabItem[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label: string;
}
export const Tabs = forwardRef<HTMLDivElement, TabsProps>(function Tabs({ tabs, value, onChange, label, className, ...rest }, ref) {
  return <div ref={ref} className={classes('tabs', className)} role="tablist" aria-label={label} data-ui-component="Tabs" {...rest}>{tabs.map((tab) => <Button key={tab.value} className={classes('tab', tab.value === value && 'is-active')} role="tab" aria-selected={tab.value === value} disabled={tab.disabled} onClick={() => onChange(tab.value)}>{tab.label}</Button>)}</div>;
});

export interface NavItem { readonly id: string; readonly icon: string; readonly label: string }
export interface NavRailProps extends Omit<HTMLAttributes<HTMLElement>, 'onChange'> {
  readonly items: readonly NavItem[];
  readonly active: string;
  readonly onChange: (id: string) => void;
  readonly label?: string;
}
export const NavRail = forwardRef<HTMLElement, NavRailProps>(function NavRail({ items, active, onChange, label = 'Primary views', className, ...rest }, ref) {
  return <nav ref={ref} className={classes('nav-rail', className)} aria-label={label} data-ui-component="NavRail" {...rest}>{items.map((item) => <Button key={item.id} className={classes('nav-item', item.id === active && 'is-active')} aria-current={item.id === active ? 'page' : undefined} onClick={() => onChange(item.id)}><i className={classes('ph', item.icon)} aria-hidden="true" /><span>{item.label}</span></Button>)}</nav>;
});

export interface CommandItem { readonly id: string; readonly label: string; readonly hint?: string; readonly shortcut?: readonly string[] }
export interface CommandPaletteProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  readonly open: boolean;
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly items: readonly CommandItem[];
  readonly active?: string;
  readonly onSelect: (id: string) => void;
  readonly onClose: () => void;
}
export function CommandPalette({ open, query, onQueryChange, items, active, onSelect, onClose, className, ...rest }: CommandPaletteProps) {
  if (!open) return null;
  return <div className="cmdk-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className={classes('cmdk', className)} role="dialog" aria-modal="true" aria-label="Command palette" data-ui-component="CommandPalette" {...rest}><div className="cmdk-head"><i className="ph ph-magnifying-glass" aria-hidden="true" /><Input className="cmdk-input" aria-label="Filter commands" value={query} onChange={(event) => onQueryChange(event.currentTarget.value)} /><kbd className="kbd">Esc</kbd></div><div className="cmdk-list">{items.map((item) => <Button key={item.id} className={classes('cmdk-item', item.id === active && 'is-active')} onClick={() => onSelect(item.id)}>{item.label}<span className="cmdk-item-hint">{item.shortcut?.join(' ') ?? item.hint}</span></Button>)}</div></div></div>;
}
