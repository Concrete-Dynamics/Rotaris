import * as React from 'react';

export interface CommandItem {
  id: string;
  label: string;
  /** Phosphor icon class, e.g. "ph-git-branch" */
  icon?: string;
  /** Shortcut keys, e.g. ['⌘','G'] */
  kbd?: string[];
  /** Right-aligned text hint when there is no shortcut */
  hint?: string;
}
export interface CommandGroup { label: string; items: CommandItem[]; }

export interface CommandPaletteProps {
  placeholder?: string;
  query?: string;
  onQueryChange?: (query: string) => void;
  groups?: CommandGroup[];
  /** id of the keyboard-highlighted row */
  activeId?: string;
  onSelect?: (id: string) => void;
  /** Backdrop click / esc */
  onClose?: () => void;
  footer?: React.ReactNode;
}
export function CommandPalette(props: CommandPaletteProps): JSX.Element;
