import { ok } from '@rotaris/kernel';
import type { Transcriber } from './port.js';

/** A deterministic stand-in, the way the scripted model client is: it reads nothing of the audio and is never shown as a transcription. */
export function scriptedTranscriber(text: string): Transcriber {
  return { transcribe: () => Promise.resolve(ok(text)) };
}
