import * as React from 'react';

export interface SelectOption { value: string; label: string; }
export interface SelectProps {
  label?: string;
  options: (string | SelectOption)[];
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}
export function Select(props: SelectProps): JSX.Element;
