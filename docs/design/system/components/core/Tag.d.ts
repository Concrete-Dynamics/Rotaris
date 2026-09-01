import * as React from 'react';

export interface TagProps {
  /** `run` / `wait` / `done` / `fail` tint from the coordinate-axis states; `accent`, `neutral`, `outline` otherwise. */
  kind?: 'accent' | 'neutral' | 'outline' | 'run' | 'wait' | 'done' | 'fail';
  children?: React.ReactNode;
}
export function Tag(props: TagProps): JSX.Element;
