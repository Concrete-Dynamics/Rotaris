import type { AgentRecord } from '@rotaris/contracts';
import { perAgentTimeoutPath, timeoutLine } from './agents.js';

/**
 * PD-CONFIG-003 revision 3 (OQ-234): the cut-off line the inspector draws under its meta line and a persona window's instance
 * tab under its state — `timeoutLine`'s one wording, with the control's path kept on one line (`agent-timeout__path`), so a
 * narrow pane never breaks "Per-agent" from "timeout" at its hyphen (the built inspector at 269 px did, 2026-10-07).
 */
export function TimeoutLine({ timedOut, className, testId }: { readonly timedOut: NonNullable<AgentRecord['timedOut']>; readonly className: string; readonly testId: string }) {
  const line = timeoutLine(timedOut);
  const path = perAgentTimeoutPath();
  const at = line.indexOf(path);
  return (
    <div className={className} data-testid={testId}>
      {at < 0 ? line : <>{line.slice(0, at)}<span className="agent-timeout__path">{path}</span>{line.slice(at + path.length)}</>}
    </div>
  );
}
