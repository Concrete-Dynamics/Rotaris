import { captureRefusal, captureUnavailable, type DictationCapture } from '@rotaris/ui';

/**
 * The microphone (OQ-455, OQ-459): `getUserMedia` and `MediaRecorder`, audio alone. Main's permission handlers decide the grant;
 * this states what came of it. Tracks are stopped on every way out, so the system's recording indicator never outlives a recording.
 */
export function captureSupport(): string | null {
  return captureUnavailable({
    secureContext: globalThis.isSecureContext === true,
    mediaDevices: typeof navigator.mediaDevices?.getUserMedia === 'function',
    recorder: typeof MediaRecorder === 'function',
  });
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export async function startCapture(): Promise<{ ok: true; capture: DictationCapture } | { ok: false; reason: string }> {
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false }); }
  catch (cause) { return { ok: false, reason: captureRefusal(cause instanceof Error ? cause.name : '') }; }
  const release = () => { for (const track of stream.getTracks()) track.stop(); };
  let recorder: MediaRecorder;
  try { recorder = new MediaRecorder(stream); recorder.start(); }
  catch { release(); return { ok: false, reason: 'The microphone could not be recorded.' }; }
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  return {
    ok: true,
    capture: {
      cancel: () => { recorder.ondataavailable = null; if (recorder.state !== 'inactive') recorder.stop(); release(); },
      stop: () => new Promise((resolve) => {
        recorder.onstop = () => {
          release();
          const blob = new Blob(chunks, { type: recorder.mimeType });
          if (blob.size === 0) { resolve({ ok: false, reason: 'Nothing was recorded.' }); return; }
          void blob.arrayBuffer().then((buffer) => { resolve({ ok: true, audioBase64: toBase64(new Uint8Array(buffer)), mimeType: recorder.mimeType }); });
        };
        recorder.stop();
      }),
    },
  };
}
