import * as React from 'react';

export interface PageHeaderProps {
  title: string;
  /** Dim context after the title, e.g. "delegation tree · auth-flow-refactor" */
  subtitle?: string;
  /** Right-aligned actions (Buttons, SegmentedControl) */
  children?: React.ReactNode;
}
export function PageHeader(props: PageHeaderProps): JSX.Element;
