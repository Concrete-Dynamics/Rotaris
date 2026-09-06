import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { ACKNOWLEDGEMENT_KIND_WORDS, ACKNOWLEDGEMENT_SEVERITY, SEVERITY_GLYPHS } from '@rotaris/contracts';
import { type Acknowledgement, type AcknowledgementStore } from '@rotaris/ui-core';
import { markMotionStart } from './motion.js';

/**
 * REQ-NOTIFY-013 / REQ-SHELL-112 / REQ-SHELL-113 — the window's ONE transient acknowledgement surface. There is no
 * second transient surface: a lone acknowledgement is this stack holding one member, and every transient the window
 * raises is shown here. It is drawn once per window (the main window and each persona window own their own stack).
 *
 * REQ-NOTIFY-012: anchored to the bottom-right of the host WINDOW's content area with 16 px margins, drawn over all
 * other content, clear of the title bar; moving or resizing the window restores the position with no user action,
 * which a fixed inset gives for nothing. Narrower host: the width reduces and the margins are kept (the CSS `min()`).
 * REQ-NOTIFY-013: at most 520 px while one is visible, at most 360 px while two or three are.
 * REQ-NOTIFY-017: newest nearest the corner — the column is drawn top-down oldest first, so the newest is lowest —
 * with an 8 px gap and no reordering.
 * REQ-NOTIFY-014: neutral and error presentations, told apart by a border and a 3× left rule, never a filled
 * background; the presentation belongs to the message, so a theme change leaves a visible one as it is.
 * REQ-NOTIFY-015: it never takes keyboard focus. Nothing here is autofocused and the container is not focusable.
 * REQ-NOTIFY-018/019: four kinds, each drawing its severity's glyph, each announcing its kind word then its title.
 * REQ-NOTIFY-020: a timeout of zero or less never expires; only the close control interacts with it.
 * REQ-NOTIFY-022: it enters by translating in from the right edge over the travel token while its opacity rises, and
 * leaves by the reverse; the travel and the two durations are theme tokens read at animation start (ADR-0050), and
 * reduced motion paints the first frame at its final position (`markMotionStart`).
 */
export interface AcknowledgementsProps {
  readonly store: AcknowledgementStore;
}

export function Acknowledgements({ store }: AcknowledgementsProps) {
  const items = useStore(store, (s) => s.items);
  if (items.length === 0) return null;
  return (
    <div
      className="ack-stack"
      data-count={items.length}
      data-testid="acknowledgements"
      // The stack reports itself politely; it never steals focus and never interrupts (REQ-NOTIFY-015).
      role="status"
      aria-live="polite"
    >
      {items.map((a) => <AcknowledgementRow key={a.id} item={a} count={items.length} onClose={() => store.getState().close(a.id)} />)}
    </div>
  );
}

function AcknowledgementRow({ item, count, onClose }: { item: Acknowledgement; count: number; onClose: () => void }) {
  const closed = useRef(false);
  const close = () => { if (closed.current) return; closed.current = true; onClose(); };
  useEffect(() => {
    // REQ-NOTIFY-020: zero or less stays until something removes it.
    if (item.timeoutMs <= 0) return;
    const timer = setTimeout(close, item.timeoutMs);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the identifier and its timeout are the whole dependency; `close` is stable per row.
  }, [item.id, item.timeoutMs]);
  const severity = ACKNOWLEDGEMENT_SEVERITY[item.kind];
  const word = ACKNOWLEDGEMENT_KIND_WORDS[item.kind];
  return (
    <div
      ref={(element) => { if (element) markMotionStart(element); }}
      className={`ack ack--${item.kind}${count > 1 ? ' ack--stacked' : ''}`}
      data-kind={item.kind}
      data-severity={severity}
      data-ack-id={item.id}
      data-testid="acknowledgement"
      // REQ-NOTIFY-019: the kind word and the title are announced as distinct phrases, the body as the description.
      aria-label={`${word}. ${item.title}`}
      {...(item.body === '' ? {} : { 'aria-description': item.body })}
    >
      <span className="ack__glyph" aria-hidden="true">{SEVERITY_GLYPHS[severity]}</span>
      <div className="ack__text">
        <span className="ack__title" data-testid="acknowledgement-title">{item.title}</span>
        {item.body !== '' && <span className="ack__body text-secondary">{item.body}</span>}
      </div>
      <button type="button" className="ack__close" aria-label={`Close the ${word.toLowerCase()} “${item.title}”`} onClick={close}>×</button>
    </div>
  );
}
