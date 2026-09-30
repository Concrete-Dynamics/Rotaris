import { useId } from 'react';
import type { AnalysisPass } from '@rotaris/contracts';
import { StatusDot, Tag } from './design-system/index.js';
import { markMotionStart } from './motion.js';

/**
 * REQ-LIBRARY-125/126 with PD-LIBRARY-002 — the two activity indicators, one component drawn in two places.
 *
 * What is contractual is exactly when each is present, its label, its accessible name and its accessible
 * description, that the activity is never conveyed by colour or animation alone (REQ-SHELL-149), and that the
 * pulse obeys the reduced-motion rule (REQ-SHELL-135). Everything else — the Tag, the dot, the cadence — is
 * presentation, and is the same Tag-with-a-status-dot the run header already uses for a run's own state.
 *
 * The labels differ per pass because the two passes are looking at different things: the sibling reviews the
 * run that just finished, and the retrospective reviews the workspace's own history. The directive requires
 * the second to be signalled by this pattern "with its own label", which is what this table is.
 */
export const IMPROVEMENT_ACTIVITY_LABELS: Readonly<Record<AnalysisPass, string>> = Object.freeze({
  post_run: 'Reviewing run for improvements…',
  retrospective: 'Reviewing workspace history for improvements…',
});

/** REQ-LIBRARY-125 fixes the post-run title-bar wording exactly; the retrospective's says what it is reading. */
const TITLE_DESCRIPTIONS: Readonly<Record<AnalysisPass, string>> = Object.freeze({
  post_run: 'Reviewing the completed run for improvements in the background. You can continue working.',
  retrospective: "Reviewing this workspace's own history for improvements in the background. You can continue working.",
});

/** The same three facts, in the run header's own wording (REQ-LIBRARY-125 leaves this one free). */
const HEADER_DESCRIPTIONS: Readonly<Record<AnalysisPass, string>> = Object.freeze({
  post_run: 'A completed run is being reviewed for improvements in the background; you can keep working while it runs.',
  retrospective: "This workspace's own history is being reviewed for improvements in the background; you can keep working while it runs.",
});

export interface ImprovementActivityProps {
  /** Present only while an analysis is active (REQ-LIBRARY-126: any pass, not one session's). */
  readonly active: boolean;
  readonly pass: AnalysisPass;
  readonly placement: 'title-bar' | 'run-header';
}

export function ImprovementActivity({ active, pass, placement }: ImprovementActivityProps) {
  const descriptionId = useId();
  if (!active) return null;
  const description = (placement === 'title-bar' ? TITLE_DESCRIPTIONS : HEADER_DESCRIPTIONS)[pass];
  /*
   * Live-run finding L10 (2026-09-29): the label is its OWN element. As a bare text node in the Tag's inline-flex box it
   * was an anonymous flex item that `text-overflow` never reaches, so at 1440 px the run header cut it mid-word
   * ("Reviewing run for improvem") with no ellipsis. `shell.css` now wraps it between words in the run header and
   * elides it with an ellipsis in the fixed-height title bar. The Tag's classes are spelled out because a className
   * REPLACES the design Tag's foundation (`componentClass`), which had left the indicator an unstyled span; `tag-run`
   * is the tone the run header draws a live run with (`RUN_STATE_TAGS`).
   */
  return (
    <Tag kind="running" className={`tag tag-run improvement-activity improvement-activity--${placement}`} role="status"
      aria-label="Improvement analysis status" aria-describedby={descriptionId} data-pass={pass}
      data-testid={`improvement-activity-${placement}`}>
      <StatusDot kind="running" pulse ref={(element) => { if (element) markMotionStart(element); }} />
      <span className="improvement-activity__label">{IMPROVEMENT_ACTIVITY_LABELS[pass]}</span>
      <span className="visually-hidden" id={descriptionId}>{description}</span>
    </Tag>
  );
}
