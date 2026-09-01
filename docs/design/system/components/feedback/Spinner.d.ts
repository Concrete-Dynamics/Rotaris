import * as React from 'react';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  /** Optional inline label, e.g. "Waiting for agent" */
  label?: string;
}
export function Spinner(props: SpinnerProps): JSX.Element;
