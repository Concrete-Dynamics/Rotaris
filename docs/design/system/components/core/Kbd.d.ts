import * as React from 'react';

export interface KbdProps {
  /** Render a sequence of key chips, e.g. ['⌘','K'] */
  keys?: string[];
  /** Single key label (ignored when keys is set) */
  children?: React.ReactNode;
}
export function Kbd(props: KbdProps): JSX.Element;
