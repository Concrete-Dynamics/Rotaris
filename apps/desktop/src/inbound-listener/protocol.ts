import { InboundAnswerEnvelopeSchema, InboundListenerEnvelopeSchema, type InboundAnswerEnvelope, type InboundAskEnvelope, type InboundListenerAsk, type InboundListenerEnvelope, type InboundListenerReplyEnvelope } from '@rotaris/contracts';
import type { InboundHost } from './host.js';

/**
 * THE LISTENER'S WIRE, read and written (REQ-MCP-127; ADR-0002 c.11): the envelopes the listener's `utilityProcess` and
 * main exchange. Kept apart from the entry so its parse rule is a pure function a test drives directly — a message the
 * shape does not fit is dropped with one line, never guessed at (the run host's own discipline).
 */

/** main → listener: one request, correlated by `id`. `null` when the message is not one. */
export function readListenerEnvelope(raw: unknown): InboundListenerEnvelope | null {
  const parsed = InboundListenerEnvelopeSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** listener → main: one answer to a `mainAsk`, correlated by `ask`. `null` when the message is not one. */
export function readAnswerEnvelope(raw: unknown): InboundAnswerEnvelope | null {
  const parsed = InboundAnswerEnvelopeSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** The listener's reply to main's request. */
export function listenerReply(id: number, reply: InboundListenerReplyEnvelope['reply']): InboundListenerReplyEnvelope {
  return { id, reply };
}

/** The listener's ask to main. */
export function listenerAsk(ask: number, request: InboundListenerAsk): InboundAskEnvelope {
  return { ask, request };
}

/** Whether a message is one of the listener's own request envelopes. */
export function isListenerEnvelope(raw: unknown): boolean {
  return readListenerEnvelope(raw) !== null;
}

/**
 * Applies one main → listener request and writes the reply: the one translation `host.apply` sits behind, so the entry
 * holds no logic and the protocol is exercised with a stand-in host. Answers whether the message was a request at all.
 */
export async function serveListenerRequest(raw: unknown, host: Pick<InboundHost, 'apply'>, send: (message: unknown) => void): Promise<boolean> {
  const envelope = readListenerEnvelope(raw);
  if (envelope === null) return false;
  const reply = await host.apply(envelope.request);
  send(listenerReply(envelope.id, reply));
  return true;
}
