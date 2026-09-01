import * as React from 'react';

export interface EmptyStateProps {
  /** Phosphor icon class, e.g. "ph-tree-structure" */
  icon?: string;
  title?: string;
  /** Second-person guidance, e.g. "Select an agent to inspect its context" */
  hint?: string;
  /** One action, usually a Button */
  action?: React.ReactNode;
}
export function EmptyState(props: EmptyStateProps): JSX.Element;
