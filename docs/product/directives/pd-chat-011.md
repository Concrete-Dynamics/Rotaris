[Product directives](../directives.md) › PD-CHAT-011

<a id="pd-chat-011"></a>

### PD-CHAT-011 — a composer draft or an image past the contract's bound is refused and the refusal is shown

A composer draft whose text exceeds `FREE_TEXT_MAX` (1,048,576 characters, `packages/contracts/src/commands.ts`,
[OQ-467](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-467)) SHALL be refused by main as
`command.malformed` and SHALL NOT be stored; the composer SHALL raise the refusal's headline in its existing error line
while the text is past the bound, so the user knows the draft is not being saved, and SHALL keep the text in the
composer unchanged. An image attachment whose base64 payload exceeds `DICTATION_AUDIO_MAX_BASE64` SHALL be refused on
the same terms, by main, with the headline naming the field and the bound; the text and the other attachments stay in
the composer (REQ-CHAT-012).

**Why, and what it costs.** REQ-CHAT-015 promises that any text left in the composer outlives the process, and
REQ-CHAT-169 accepts image attachments with no size stated. The renderer is the one process that shows web content
(ADR-0044), so main cannot accept a payload of any size from it; a bound at the trust boundary is the only place the
promise can be kept honest. The cost is that a draft over 1,048,576 characters, or an image over 32 MiB of base64, is
not accepted, and that the user sees a refusal they did not have before; the gain is that neither is lost silently in a
background write, and that a compromised renderer cannot exhaust main through a draft or an image.

> **Narrows:** REQ-CHAT-015, REQ-CHAT-169

*Raised as [OQ-467](../../archive/architecture/open-questions/69-spikes-and-later-questions-36.md#oq-467) by the hardening
request [R-091](../requests.md#r-091), 2026-11-01, and ruled the same day by the orchestrator's consortium under the
owner's delegation ([R-072](../requests.md#r-072)); minted because a refused draft departs from REQ-CHAT-015's
unconditional persistence. Built by the hardening plan's bundle `ipc-bounds-and-redaction`.*
