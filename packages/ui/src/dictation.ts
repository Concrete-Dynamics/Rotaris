/**
 * Dictation's rules, with no React in them (OQ-455, OQ-456): the control's phases and what each says, and where a transcript lands.
 */
export type DictationPhase = 'idle' | 'starting' | 'recording' | 'transcribing';
export type DictationEvent = 'press' | 'started' | 'refused' | 'captured' | 'finished';

/** OQ-455: a recording stops itself after this long. */
export const DICTATION_MAX_RECORDING_MS = 5 * 60_000;

/** A press starts from idle and stops a recording; anywhere else it does nothing, so a double press cannot start two captures. */
export function nextDictationPhase(phase: DictationPhase, event: DictationEvent): DictationPhase {
  switch (event) {
    case 'press': return phase === 'idle' ? 'starting' : phase;
    case 'started': return phase === 'starting' ? 'recording' : phase;
    case 'refused': return phase === 'starting' ? 'idle' : phase;
    case 'captured': return phase === 'recording' ? 'transcribing' : phase;
    case 'finished': return 'idle';
  }
}

export interface DictationControlView {
  readonly icon: string;
  readonly name: string;
  /** The tooltip and the accessible description: REQ-CHAT-007's two channels. */
  readonly title: string;
  readonly disabled: boolean;
  /** What the polite live region says when the phase is entered; empty at rest. */
  readonly announcement: string;
}

/** `unavailable` is the reason the control cannot start at all; a recording under way is still stoppable if one arises. */
export function dictationControlView(phase: DictationPhase, unavailable: string | null): DictationControlView {
  switch (phase) {
    case 'idle':
      return unavailable !== null
        ? { icon: 'ph-microphone', name: 'Dictate', title: unavailable, disabled: true, announcement: '' }
        : { icon: 'ph-microphone', name: 'Dictate', title: 'Dictate into the composer. The text is inserted and never sent.', disabled: false, announcement: '' };
    case 'starting':
      return { icon: 'ph-microphone', name: 'Dictate', title: 'Starting the microphone…', disabled: true, announcement: '' };
    case 'recording':
      return { icon: 'ph-stop-circle', name: 'Stop dictating', title: 'Recording. Press again to stop and transcribe.', disabled: false, announcement: 'Recording.' };
    case 'transcribing':
      return { icon: 'ph-dots-three', name: 'Dictate', title: 'Transcribing the recording. You can keep typing.', disabled: true, announcement: 'Transcribing.' };
  }
}

export interface CaptureSupport {
  readonly secureContext: boolean;
  readonly mediaDevices: boolean;
  readonly recorder: boolean;
}

/** OQ-459: why this page cannot capture at all, or null. Chromium offers no `mediaDevices` outside a secure context, so that is asked first. */
export function captureUnavailable(support: CaptureSupport): string | null {
  if (!support.secureContext) return 'Dictation needs a secure page, and this window was loaded over plain HTTP. Open it from the installed application or from localhost.';
  if (!support.mediaDevices || !support.recorder) return 'This window cannot record audio, so dictation is unavailable.';
  return null;
}

/** OQ-459: a capture refusal by its DOM exception name, in a sentence that says what to do. */
export function captureRefusal(errorName: string): string {
  switch (errorName) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone access was refused. Allow it for Rotaris in your system settings, then try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No microphone was found. Connect one, then try again.';
    case 'NotReadableError':
    case 'AbortError':
      return 'The microphone could not be read. Another application may be using it.';
    default:
      return 'The microphone could not be started.';
  }
}

export interface InsertedTranscript {
  readonly value: string;
  readonly caret: number;
}

/**
 * OQ-456: the transcript goes at the caret of what the composer holds now. A selection is kept and the text goes after it, since
 * dictating never deletes. One space separates it from a neighbour it would otherwise touch. A blank transcript changes nothing.
 */
export function insertTranscript(value: string, selectionStart: number, selectionEnd: number, transcript: string): InsertedTranscript {
  const at = Math.min(Math.max(selectionStart, selectionEnd), value.length);
  const text = transcript.trim();
  if (text === '') return { value, caret: at };
  const before = value.slice(0, at);
  const after = value.slice(at);
  const lead = before !== '' && !/\s$/.test(before) ? ' ' : '';
  const trail = after !== '' && !/^\s/.test(after) ? ' ' : '';
  const inserted = `${lead}${text}${trail}`;
  return { value: `${before}${inserted}${after}`, caret: at + lead.length + text.length };
}
