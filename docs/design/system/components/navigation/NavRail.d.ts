import * as React from 'react';

export interface NavItem { id: string; icon: string; label: string; }
export interface NavRailProps {
  /** The rail's entries. The primary-view set and its order come from the product spec (REQ-SHELL-023), not from this design system. */
  items?: NavItem[];
  active?: string;
  onSelect?: (id: string) => void;
}
export function NavRail(props: NavRailProps): JSX.Element;
