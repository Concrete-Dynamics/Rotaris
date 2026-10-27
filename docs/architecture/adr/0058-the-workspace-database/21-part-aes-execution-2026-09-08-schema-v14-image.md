# ADR-0058 — The workspace store: machine-local, found by a workspace identifier, and how it is backed up — Part AE's execution — 2026-09-08, schema v14: image attachment metadata

Part 21 of 22 of [ADR-0058](../0058-the-workspace-database.md), which indexes every part.

## Part AE's execution — 2026-09-08, schema v14: image attachment metadata

REQ-CHAT-046, REQ-CHAT-153 and REQ-CHAT-169..174 add one `attachments` JSON column to
`transcript_rows`. Each ordered entry records the original name, content-derived media type, byte count,
session-relative path and SHA-256 digest. Image bytes live below the existing per-session files directory
from REQ-SESSION-002. A projection verifies the relative path and digest and publishes an explicit
unavailable state while preserving the row and surrounding transcript. The command boundary carries
base64 once to the run host; snapshots and the database retain metadata. Schema v14 is one append-only
migration and changes no query or index.

The selected model's REQ-PROVIDER-149 declaration reaches both the composer and the engine gate. Image
parts use the existing model `ContentPart` boundary. REQ-PROVIDER-150 remains owed; the composer therefore
counts every image as an unknown positive contribution and labels the displayed estimate as a lower bound.
