import { useCallback, useEffect, useRef, useState } from 'react';
import { StripActionButton } from './design-system/index.js';
import { DICTATION_MAX_RECORDING_MS, dictationControlView, nextDictationPhase, type DictationPhase } from './dictation.js';
import { motionReduced } from './motion.js';

/** One capture under way: `stop` ends it and answers what was recorded, `cancel` ends it and keeps nothing. */
export interface DictationCapture {
  stop(): Promise<{ ok: true; audioBase64: string; mimeType: string } | { ok: false; reason: string }>;
  cancel(): void;
}

/** What a window gives the control: a surface holds no bridge and no microphone (seam §1). */
export interface DictationHost {
  /** Why the control cannot start at all, or null. */
  readonly unavailable: string | null;
  start(): Promise<{ ok: true; capture: DictationCapture } | { ok: false; reason: string }>;
  transcribe(audioBase64: string, mimeType: string): Promise<{ ok: true; text: string } | { ok: false; reason: string }>;
  /** OQ-456: a transcript that arrived after the composer left the screen goes to the end of the stored draft, not nowhere. */
  appendToDraft(text: string): void;
}

/**
 * OQ-455: the composer's microphone. Never submits: its only outward act is `onTranscript`. The transcription is awaited off the
 * event loop's input path, so the text area stays editable throughout (REQ-CHAT-006).
 */
export function DictationControl({ host, onTranscript, onError }: { host: DictationHost; onTranscript: (text: string) => void; onError: (message: string | null) => void }) {
  const [phase, setPhase] = useState<DictationPhase>('idle');
  const capture = useRef<DictationCapture | null>(null);
  const autoStop = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const step = useCallback((event: Parameters<typeof nextDictationPhase>[1]) => { if (mounted.current) setPhase((p) => nextDictationPhase(p, event)); }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (autoStop.current !== null) clearTimeout(autoStop.current);
      capture.current?.cancel();
      capture.current = null;
    };
  }, []);

  const stop = useCallback(async () => {
    const held = capture.current;
    if (held === null) return;
    capture.current = null;
    if (autoStop.current !== null) { clearTimeout(autoStop.current); autoStop.current = null; }
    step('captured');
    /*
     * ADR-0019 / R0-2, as `submitPrompt` carries it: every way out of this leaves the control at rest. A capture or a
     * transcription that rejects — a device unplugged mid-recording, a main process that went away — must not wedge the
     * control in `transcribing` or `starting` with its button disabled, so the refusal is shown and the phase ends.
     */
    try {
      const recorded = await held.stop();
      if (!recorded.ok) { onError(recorded.reason); return; }
      const r = await host.transcribe(recorded.audioBase64, recorded.mimeType);
      if (!mounted.current) { if (r.ok && r.text.trim() !== '') host.appendToDraft(r.text); return; }
      if (!r.ok) onError(r.reason);
      else if (r.text.trim() === '') onError('No speech was recognized.');
      else { onError(null); onTranscript(r.text); }
    } catch (cause) {
      if (mounted.current) onError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      step('finished');
    }
  }, [host, onError, onTranscript, step]);

  const press = async () => {
    if (phase === 'recording') { await stop(); return; }
    if (phase !== 'idle') return;
    step('press');
    // The same rule as `stop`'s: a start that refuses or rejects returns the control to rest rather than disabling it.
    try {
      const started = await host.start();
      if (!started.ok) { onError(started.reason); return; }
      if (!mounted.current) { started.capture.cancel(); return; }
      onError(null);
      capture.current = started.capture;
      autoStop.current = setTimeout(() => { void stop(); }, DICTATION_MAX_RECORDING_MS);
      step('started');
    } catch (cause) {
      if (mounted.current) onError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      if (capture.current === null) step('refused');
    }
  };

  const view = dictationControlView(phase, host.unavailable);
  return (
    <>
      <span id="dictation-reason" className="visually-hidden">{view.title}</span>
      <span className="visually-hidden" role="status" aria-live="polite" data-testid="dictation-status">{view.announcement}</span>
      <StripActionButton icon={view.icon} aria-label={view.name} title={view.title} aria-describedby="dictation-reason" disabled={view.disabled} aria-pressed={phase === 'recording'}
        data-testid="composer-dictate" data-dictation={phase} data-motion={motionReduced() ? 'reduced' : 'full'} onClick={() => { void press(); }} />
    </>
  );
}
