import * as React from 'react';

export interface LogLine {
  /** e.g. "14:02:11" */
  time: string;
  /** Colored by the axis system: run=teal, done=violet, warn=amber, fail=red, info=neutral */
  level: 'info' | 'run' | 'done' | 'warn' | 'fail';
  text: React.ReactNode;
}
export interface LogPanelProps {
  lines: LogLine[];
  /** CSS max-height; the panel scrolls beyond it */
  maxHeight?: number | string;
}
export function LogPanel(props: LogPanelProps): JSX.Element;
