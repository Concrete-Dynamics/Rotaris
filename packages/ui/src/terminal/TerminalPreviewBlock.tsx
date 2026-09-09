import { markMotionStart } from '../motion.js';
import { HEADER, PREVIEW } from './labels.js';
import type { TerminalPreview } from './streams.js';

/**
 * Part AM — the live terminal preview inside a transcript row (REQ-SHELL-079: "a live preview embedded in the
 * transcript row"; REQ-CHAT-063/066/076). It renders the display emulator's screen text — the same cells, the same
 * running-or-exited state and the same truncation indication the pop-out shows (REQ-SHELL-102) — and clicking it
 * requests the pop-out for the stream. It accepts no input: the pop-out is the only surface that does (REQ-SHELL-079),
 * which is why the mockup's interrupt and kill glyphs beside the header are not drawn here.
 *
 * Craft from the mockup's live terminal block (`docs/design/mockup`, Workspace → transcript column): a mono line with
 * the pulsing running glyph in axis Y, the tertiary state, the action at the right; a bordered mono block on the
 * terminal ground; a 2xs tertiary caption. The mockup's line also names the tool and the command, which in this
 * transcript the row's own header line already does (REQ-CHAT-060), so it is not said twice. README §7.1 names the
 * block as one of the five surfaces that EARN a border.
 */
export interface TerminalPreviewBlockProps {
  readonly preview: TerminalPreview;
  readonly onOpen?: ((streamId: string) => void) | undefined;
}

export function TerminalPreviewBlock({ preview, onOpen }: TerminalPreviewBlockProps) {
  const open = onOpen === undefined ? undefined : () => onOpen(preview.streamId);
  const state = preview.running ? `running · ${PREVIEW.live}` : preview.exitCode === undefined ? 'exited' : `exit ${preview.exitCode}`;
  return (
    <div className="term-preview" data-testid="term-preview" data-stream-id={preview.streamId} data-running={preview.running} data-truncated={preview.truncated}>
      <div className="term-preview__head mono">
        <span
          ref={(element) => { if (element && preview.running) markMotionStart(element); }}
          className={`term-preview__dot${preview.running ? ' row__pulse' : ''}`}
          aria-hidden="true"
        >{preview.running ? '◉' : '○'}</span>
        {/* The row's own header already names the tool and the command (REQ-CHAT-060), so this line carries only what the
            stream adds: its running-or-exited state and its truncation indication — the two facts REQ-SHELL-102 says
            every surface must show identically — and the way to the pop-out. */}
        <span className="term-preview__state text-tertiary" data-testid="term-preview-state">{state}</span>
        {preview.truncated && (
          <span className="term-preview__truncated text-tertiary" aria-label={HEADER.truncationName} title={HEADER.truncationTooltip} data-testid="term-preview-truncated">· {HEADER.truncationLabel}</span>
        )}
        <button type="button" className="btn btn-ghost btn-compact" aria-label={PREVIEW.openName} onClick={open} disabled={open === undefined} data-testid="term-preview-open">Open terminal</button>
      </div>
      {/* REQ-CHAT-076: clicking the preview requests the pop-out; the text stays selectable with the pointer (REQ-CHAT-075). */}
      <div
        className="term-preview__screen mono"
        role="button"
        tabIndex={open === undefined ? -1 : 0}
        aria-label={PREVIEW.openName}
        aria-disabled={open === undefined}
        onClick={open}
        onKeyDown={(event) => { if (open && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); open(); } }}
        data-testid="term-preview-screen"
      >
        <pre className="term-preview__lines">{preview.lines.join('\n')}</pre>
      </div>
      <span className="term-preview__caption text-tertiary">{PREVIEW.caption}</span>
    </div>
  );
}
