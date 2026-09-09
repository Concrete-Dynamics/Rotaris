---
req-id: [REQ-200, REQ-201, REQ-202]
status: approved
trace: optional
test: optional
title: Three in one document
---

# REQ-200 - Three in one document

A multi-identifier document (REQ-TRACE-027 to REQ-TRACE-035): three identifiers, one content hash, three
canonical hashes.

## REQ-200

The document's own identifier; its title is the shared frontmatter title.

## REQ-201 - The draft child

status: draft
legacy-id: LEGACY-201

Overridden to draft, and reachable from a `covers:` comment by its legacy identifier.

## REQ-202: The optional child

Nothing overridden; the shared optional flags apply.
