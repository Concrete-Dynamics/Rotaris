export interface StatusDotProps {
  /**
   * Two semantic families — never mix them on one surface:
   * lifecycle (agents, sessions): run = teal, wait = amber, done = violet, fail = red;
   * health (connections, providers): ok = teal, warn = amber, fail = red.
   */
  state?: 'run' | 'wait' | 'done' | 'fail' | 'ok' | 'warn' | 'idle';
  /** Pulses (opacity breathing) while a state like `run` is actively in progress. */
  pulse?: boolean;
  size?: number;
}
export function StatusDot(props: StatusDotProps): JSX.Element;
