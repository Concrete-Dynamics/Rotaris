import * as React from 'react';

export interface InputProps {
  label?: string;
  multiline?: boolean;
  placeholder?: string;
  value?: string;
  disabled?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
}
export function Input(props: InputProps): JSX.Element;
