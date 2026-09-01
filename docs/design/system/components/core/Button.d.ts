import * as React from 'react';

export interface ButtonProps {
  /** Visual treatment. Primary is the one filled variant; the rest are outline/ghost. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'warning' | 'link';
  size?: 'default' | 'compact';
  /** Phosphor icon class, e.g. "ph-plus" */
  icon?: string;
  iconRight?: string;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
  children?: React.ReactNode;
}
export function Button(props: ButtonProps): JSX.Element;
