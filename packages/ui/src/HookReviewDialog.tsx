import { useEffect, useRef, useState } from 'react';
import type { HooksSummary } from '@rotaris/contracts';

/**
 * REQ-HOOKS-106/107 — the review dialog, painted inside its own modal window: the workspace path, how
 * many hooks it declares in `.rotaris/agents.yaml`, that they are shell commands supplied by the
 * repository's authors that will run on this machine under the user's account, and each hook read-only
 * in a fixed-width block with its command EXACTLY as written — plain text, never markup. Two buttons:
 * "Do not run these hooks" (reject; the default; initial focus; Enter) and "Allow these hooks" (styled
 * as risk; an explicit click). Escape and the close control resolve as not approved; the decision is
 * reported once. A failed write shows as an error label. This is the only surface that shows a command.
 */
export interface HookReviewDialogProps {
  readonly workspace: string;
  readonly entries: HooksSummary['review'];
  readonly onDecide: (trusted: boolean) => Promise<{ ok: true } | { ok: false; reason: string }>;
}

export function HookReviewDialog({ workspace, entries, onDecide }: HookReviewDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reject = useRef<HTMLButtonElement>(null);
  const n = entries.length;
  useEffect(() => { reject.current?.focus(); }, []);
  const decide = async (trusted: boolean) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await onDecide(trusted);
    if (!r.ok) { setError(r.reason); setBusy(false); }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); void decide(false); }
      if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) { e.preventDefault(); void decide(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);
  return (
    <div className="approval hook-review" role="dialog" aria-modal="true" aria-labelledby="hook-review-title" aria-describedby="hook-review-body">
      <div className="dialog hook-review__dialog">
        <h1 id="hook-review-title" className="dialog-title">Review this workspace's hooks</h1>
        <p id="hook-review-body" className="dialog-body">
          <span className="mono">{workspace}</span> declares {n === 1 ? '1 hook' : `${n} hooks`} in <span className="mono">.rotaris/agents.yaml</span>.
          {' '}{n === 1 ? 'It is a shell command' : 'They are shell commands'} supplied by the repository's authors that will run on this machine under your own account.
        </p>
        <div className="hook-review__list" tabIndex={0} aria-label="The declared hooks, read-only">
          {entries.map((h, i) => (
            <pre key={i} className="hook-review__entry mono" aria-label={`Hook ${i + 1}`}>{[
              `name     ${h.name}`,
              `event    ${h.event}`,
              `matches  ${h.matcher === '' ? 'every tool call' : h.matcher}`,
              `timeout  ${h.timeoutSeconds}s ${h.required ? '(blocks the tool call on failure)' : '(advisory)'}`,
              h.enabled ? '' : 'declared with enabled: false — currently inert',
              `command  ${h.command}`,
            ].filter((l) => l !== '').join('\n')}</pre>
          ))}
        </div>
        {error && <p className="approval__status" role="alert">The decision could not be saved: {error}</p>}
        <div className="dialog-actions approval__actions">
          <button ref={reject} type="button" className="btn btn-secondary" disabled={busy} onClick={() => { void decide(false); }} aria-description="Records a refusal: these hooks stay skipped and you are not asked again while they are unchanged.">Do not run these hooks</button>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => { void decide(true); }} aria-description="Allows exactly these commands to run on later loads of this workspace; any change to them reopens the review.">Allow these hooks</button>
        </div>
      </div>
    </div>
  );
}
