import type { SessionArtifactLink } from '@rotaris/contracts';
import { Button as DesignButton } from './design-system/index.js';

/**
 * REQ-MONITOR-052/068/069 (live-run finding K1, R-067): the artifact links an agent surface draws — the inspector's, the
 * persona window's instance card and its persona-wide card. Each link names the artifact by its slug in the accent the
 * language gives a link (`.btn-link`, the mockup's inspector "Artifacts" line), carries the title as its tooltip, and states
 * its ready flag as text (REQ-MONITOR-044; REQ-LIBRARY-136's "ready", else the status), never by colour alone
 * (REQ-SHELL-149). Following one opens the artifact (`onOpen`; what it opens is OQ-125's reading); with no opener the link
 * is drawn disabled, not inert.
 */
export function ArtifactLinkList({ links, onOpen, testId }: { links: readonly SessionArtifactLink[]; onOpen?: ((id: string) => void) | undefined; testId?: string | undefined }) {
  return (
    <span className="artifact-links" data-testid={testId}>
      {links.map((a) => (
        <span key={a.id} className="artifact-link" data-artifact-id={a.id} data-ready={a.ready ? '1' : '0'}>
          <DesignButton type="button" className="btn btn-link artifact-link__open mono" disabled={!onOpen} title={a.title === '' ? a.slug : a.title}
            aria-label={`Open artifact ${a.title === '' ? a.slug : a.title}`} onClick={() => onOpen?.(a.id)}>{a.slug}</DesignButton>
          <span className="artifact-link__state">{a.ready ? 'ready' : a.status}</span>
        </span>
      ))}
    </span>
  );
}

/** REQ-MONITOR-044/052: an agent's produced and received artifacts, each group named, or the stated empty sentence. */
export function AgentArtifactLinks({ produced, received, empty, onOpen, testId }: {
  produced: readonly SessionArtifactLink[]; received: readonly SessionArtifactLink[]; empty: string; onOpen?: ((id: string) => void) | undefined; testId: string;
}) {
  if (produced.length === 0 && received.length === 0) return <span className="text-secondary" data-testid={`${testId}-empty`}>{empty}</span>;
  return (
    <span className="artifact-groups">
      {produced.length > 0 && <span className="artifact-group" data-group="produced"><span className="artifact-group__label">Produced</span><ArtifactLinkList links={produced} onOpen={onOpen} testId={`${testId}-produced`} /></span>}
      {received.length > 0 && <span className="artifact-group" data-group="received"><span className="artifact-group__label">Received</span><ArtifactLinkList links={received} onOpen={onOpen} testId={`${testId}-received`} /></span>}
    </span>
  );
}
