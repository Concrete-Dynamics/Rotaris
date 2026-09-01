export interface MeterBarProps {
  pct: number;
  color?: string;
  /** Draws a tick at this percent — the compression/quota threshold. */
  threshold?: number;
}
export function MeterBar(props: MeterBarProps): JSX.Element;
