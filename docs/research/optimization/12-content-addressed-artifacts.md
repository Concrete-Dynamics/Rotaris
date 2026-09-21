# Content-Addressed Artifacts

Store immutable payloads once and reference them by verified content identity, with explicit provenance, retention, and publication semantics.

**Document version:** 1.0  
**Reference review date:** 2026-09-21  
**Status:** Framework-agnostic implementation profile. The interfaces and normative requirements below are proposed design contracts, not claims of a universal standard or drop-in compatibility with the referenced products.

`MUST` identifies a correctness requirement of this profile; `SHOULD` identifies a recommended default. JSON describes a conceptual wire format; pseudocode is language-neutral. Existing authorization and workspace controls are assumed.

## 1. Purpose and scope

Provide a common immutable payload store for logs, reports, snapshots, maps, generated diffs, and checkpoint evidence. The model and tools exchange compact artifact references instead of repeatedly transmitting bulk data.

Git documents a content-addressable object store [1]. Bazel separately documents content-addressable output storage and action-result metadata [2]. This guide uses those ideas without requiring Git's object format, its hash framing, or a build system.

An artifact answers "which bytes?" An observation answers "which execution produced or returned them?" A receipt answers "what effect occurred?" Content equality is not execution identity, freshness, authorization, or provenance.

## 2. Design contract and invariants

A published artifact MUST be immutable. Its digest MUST be computed over a specified byte representation using an advertised algorithm. The baseline is SHA-256 over exact stored logical payload bytes, before optional storage compression or encryption.

A digest identifier MUST never be rebound to different bytes. Uploads remain unpublished until byte count and digest verification complete. An interrupted upload cannot appear as a valid artifact.

Metadata such as MIME type, producer, and timestamps is not inherently authenticated by a payload digest. Store it in separate descriptors or a separately hashed manifest, and distinguish declared metadata from verified content facts.

Reference lifetime is separate from content identity. A digest may remain meaningful after local retention expires, but the harness must not imply that an expired payload is still retrievable.

## 3. Data model and tool interface

```json
{
  "artifact_id": "artifact_17",
  "digest": {"algorithm": "sha256", "hex": "illustrative-full-digest"},
  "byte_length": 183422,
  "media_type": "text/plain",
  "encoding": "utf-8",
  "storage_profile": "raw-bytes-v1",
  "retention": {"pinned_by": ["checkpoint_12"], "expires_at": null}
}
```

The digest string above is a placeholder illustrating the field, not a valid hash fixture. Full digests use the algorithm's required length. Model-facing aliases may be short and opaque, but must resolve to the complete verified identity.

```text
put_artifact(byte_stream, expected_digest?, declared_media_type?)
get_artifact(artifact_id)
read_artifact_range(artifact_id, byte_offset, byte_length)
inspect_artifact(artifact_id)
pin_artifact(artifact_id, owner_id, lifetime?)
unpin_artifact(artifact_id, owner_id)
```

For large objects, an optional manifest lists ordered chunk digests, byte lengths, and a schema version. That manifest has its own digest and identity. A chunked-manifest digest is not automatically the same as the digest of the concatenated original payload.

## 4. Implementation workflow

Stream an upload into temporary storage while counting bytes and computing its digest. Compare any caller-supplied expectation only after the entire stream is captured. On mismatch, reject and remove or quarantine the incomplete upload.

Publish under the content address using an atomic put-if-absent operation. Concurrent identical uploads converge on one verified object. If an existing address has a different length or different verified bytes, report an integrity failure; do not overwrite it or assume a short prefix uniquely identifies content.

Keep logical payload identity independent of storage encoding. Compressing the same payload differently should not change its content identity when the digest profile hashes the uncompressed logical bytes. Record the storage encoding so reads can reverse it deterministically.

Do not normalize arbitrary text before hashing. LF/CRLF, trailing spaces, BOMs, and encoding changes are different bytes. For a structured manifest where semantic-equivalent JSON should hash identically, define a canonical encoding such as JCS and version that choice [3].

On reads, verify content integrity before returning it under a verified claim. The simplest baseline verifies the complete object. Efficient range reads need trusted verified backing storage or a chunked integrity scheme; reading a small range cannot independently prove the digest of the complete object. Report the actual verification scope.

Implement retention through explicit roots: active observations, cache entries, checkpoints, mutation preimages, and user-pinned artifacts. Garbage collection follows registered references in manifests, not arbitrary strings found in text. Coordinate collection with new pins/publication so an artifact cannot be deleted between being referenced and becoming retained.

## 5. Reference pseudocode

```text
function put_artifact(stream, expected_digest):
    temporary = store.begin_unpublished_upload()
    hasher = SHA256()
    size = 0
    for bytes in stream:
        temporary.append(bytes)
        hasher.update(bytes)
        size += length(bytes)
    digest = hasher.finish()
    require expected_digest is absent or expected_digest == digest
    existing = store.publish_if_absent(digest, temporary, size)
    if existing:
        verify_existing_matches_uploaded_bytes(existing, temporary)
        discard(temporary)
    return descriptor_for_verified_object(digest, size)

function collect_unreferenced():
    roots, epoch = retention.snapshot_roots()
    live = traverse_registered_manifest_edges(roots)
    candidates = objects_not_live_and_older_than_grace_period(live)
    delete_only_if_still_unpinned_and_unreferenced(candidates, epoch)
```

An implementation may optimize collision checks using its storage-integrity guarantees, but it must not replace full digest identity with a short user-visible alias. Handle newly acquired pins during collection through locking, epochs, or another explicit protocol.

## 6. Worked example

Two test executions produce byte-identical logs. Their observations are `obs_31` and `obs_32`, each with a different call identifier and execution time. Both reference the same payload artifact.

A checkpoint pins `obs_31` and its artifact. Expiring the ordinary test-log TTL does not remove that artifact while the checkpoint still depends on it. Later the checkpoint is retired, and the artifact becomes collectible if no other root refers to it.

A live process log grows during execution. It cannot keep one immutable final digest while bytes are appended. Store immutable chunks with a changing process manifest, then publish a final immutable observation when capture closes.

## 7. Failure modes and recovery

| Code | Meaning | Recovery |
|---|---|---|
| `DIGEST_MISMATCH` | Received bytes differ from the expected payload. | Reject the upload and retransmit from a trusted source. |
| `ARTIFACT_CORRUPT` | Stored bytes fail integrity checks. | Quarantine and recover from another verified copy. |
| `ARTIFACT_EXPIRED` | Payload was legitimately reclaimed. | Return the retention limitation; do not silently regenerate under the same execution identity. |
| `UNKNOWN_DIGEST_PROFILE` | Algorithm or framing is unsupported. | Use a supported profile or explicit migration. |
| `INCOMPLETE_UPLOAD` | Stream ended before finalization. | Resume through an upload protocol or restart; keep it unpublished. |
| `PIN_CONFLICT` | Retention transition raced with deletion. | Resolve atomically before publishing dependent metadata. |
| `RANGE_VERIFICATION_UNAVAILABLE` | Requested proof is stronger than storage supports. | Verify full object or return a clearly weaker range view. |

## 8. Integration and lifecycle

[Observations](02-addressable-observations.md) own execution metadata and views. [Caching](10-version-aware-tool-result-caching.md) maps input identities to artifacts. [Checkpoints](11-execution-checkpoints.md) retain evidence, while [receipts](14-mutation-receipts-and-rollback.md) retain before/after images needed for supported undo.

Use existing resource-scope controls when resolving aliases or digests. Physical deduplication does not imply that every caller may retrieve every matching object. This document assumes those controls already exist rather than redesigning them.

A storage migration must preserve the advertised digest profile or create new identities with explicit mappings. Changing compression is not a logical payload migration; changing canonicalization is. Export manifests with algorithm, lengths, encoding, and reference information so another implementation can verify them.

## 9. Conformance tests

| Scenario | Required assertion |
|---|---|
| Same bytes uploaded twice | Same complete content identity; no duplicate required storage. |
| Same bytes from different executions | Distinct observation provenance remains intact. |
| CRLF versus LF | Different raw-byte identities. |
| Interrupted upload | No published valid artifact. |
| Concurrent identical uploads | One verified object survives without corruption. |
| Deliberate short-alias collision | Alias resolution never substitutes another full digest. |
| Stored corruption | Read detects failure before claiming verification. |
| Partial range read | Integrity claim matches actual proof scope. |
| New pin races with collection | Published references do not point to deleted data. |
| Checkpoint retains old artifact | Ordinary TTL does not override the pin. |
| Chunk order changes | Manifest identity and reconstructed bytes change. |

## 10. Metrics and rollout

Track deduplication ratio, bytes retained by each root class, retrieval latency, integrity failures, dangling references, and collection lag. Storage savings alone are not sufficient if agents frequently receive expired handles.

Start with whole-object storage, full verification, and explicit pins. Add chunking only for measured large-object or range-read needs. Test collection under concurrent publication before enabling aggressive retention limits.

## 11. Implementation checklist

- [ ] Define exact digest algorithm, byte framing, and alias resolution.
- [ ] Finalize uploads before atomic publication.
- [ ] Separate payload identity from provenance and metadata claims.
- [ ] Preserve raw bytes and version structured canonicalization.
- [ ] Implement truthful read verification and race-safe retention roots.
- [ ] Test corruption, interrupted uploads, deduplication, and collection races.

## 12. References and further reading

[1] [Git, Git Objects](https://git-scm.com/book/en/v2/Git-Internals-Git-Objects.html) - content-addressable object storage and the distinction between content and history metadata. This guide does not adopt Git's example object framing or SHA-1 format.

[2] [Bazel, Remote caching](https://bazel.build/remote/caching) - separation between a content-addressable store and action-result metadata.

[3] [RFC 8785, JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785) - one explicit representation for hashable structured manifests, within its supported data model.
