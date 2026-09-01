export interface ContextRingProps {
  pct: number;
  label?: string;
  sub?: string;
  /** Draws the danger-colored compression-threshold tick, e.g. 80. */
  threshold?: number;
  size?: number;
}
export function ContextRing(props: ContextRingProps): JSX.Element;
