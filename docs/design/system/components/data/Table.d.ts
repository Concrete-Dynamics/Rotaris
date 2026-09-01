import * as React from 'react';

export interface TableProps {
  columns: string[];
  rows: React.ReactNode[][];
}
export function Table(props: TableProps): JSX.Element;
