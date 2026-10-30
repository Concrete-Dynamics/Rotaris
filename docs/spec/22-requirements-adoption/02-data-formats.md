[Requirements Adoption Assistant](../22-requirements-adoption.md) › Part 02

## Data & Formats

Every format here is JSON. None is read by the traceability toolchain: the toolchain reads the layout file of
REQ-TRACE-040 and nothing the assistant records.

### The detection result

| Field | Meaning |
|---|---|
| `candidates[]` | `{ id, dir, prefix, shape, documents, identifiers, numbering, gaps, reasons[], samples[] }` — `id` is `<dir>#<prefix>#<shape>`; `shape` is one of `frontmatter`, `bullet`, `heading`, `bold-line`, `table-row`; `numbering` is one of `contiguous`, `sparse`, `dotted`, `zero-padded`; `prefix` may hold a hyphen, which REQ-ADOPT-008 names undecidable (REQ-ADOPT-007, REQ-ADOPT-008) |
| `implRoots[]`, `testRoots[]` | repository-relative directories (REQ-ADOPT-009) |
| `testFilePatterns[]` | the test file-name forms seen: `*.test.*`, `*.spec.*`, `*_test.*`, `test_*.*` |
| `annotations[]` | `{ extension, form, count, samples[] }` — `form` is the text before the identifier on its line, comment marker included, whitespace collapsed |
| `undecided[]` | `{ code, detail }` — `code` one of `no-store`, `several-stores`, `several-families`, `dotted-numbering`, `zero-padded-numbering`, `namespaced-prefix`, `mixed-shapes`, `tests-colocated`, `no-annotations`, `bound-reached` (REQ-ADOPT-010) |
| `bounds` | `{ files, bytes, reached: null \| 'files' \| 'bytes' }` |

### The interpretation

The model's answer, one JSON object with exactly these keys; any other key is a refusal (REQ-ADOPT-013).

| Key | Value |
|---|---|
| `candidate` | a candidate `id` from the detection result |
| `id_prefix` | REQ-TRACE-038's `id_prefix` |
| `definition_pattern` | a regular expression with one capture group, or `null` for a `frontmatter` candidate |
| `impl_roots`, `test_roots` | lists of repository-relative directories |
| `annotation_conventions` | REQ-TRACE-073's list, each entry exactly its six keys |
| `notes` | a string of at most 500 characters, recorded and never executed |

### The adoption record

`.rotaris/requirements-adoption.json` (REQ-ADOPT-018), written atomically (REQ-ADOPT-021):

```json
{
  "version": 1,
  "recordedAt": "2026-10-29T12:00:00.000Z",
  "how": "run",
  "adapter": {
    "candidate": "docs/requirements#FR#bullet",
    "storeDir": "docs/requirements",
    "idPrefix": "FR",
    "extraction": { "kind": "definition-lines", "pattern": "^-\\s+\\*\\*(FR-\\d+)\\*\\*" },
    "layout": { "requirements_dir": "docs/requirements", "id_prefix": "FR", "impl_roots": ["src"], "test_roots": ["tests"], "annotation_conventions": [] },
    "notes": ""
  },
  "documents": [{ "path": "docs/requirements/core.md", "contentHash": "0123456789abcdef", "identifiers": ["FR-1", "FR-2"] }],
  "requirements": [{ "id": "FR-1", "document": "docs/requirements/core.md", "canonicalHash": "0123456789abcdef0123456789abcdef" }]
}
```

`how` is `run` (an adoption run) or `record` (REQ-ADOPT-020); `extraction.kind` is `frontmatter` (no pattern) or
`definition-lines`. `contentHash` is REQ-TRACE-036's 16 hex, `canonicalHash` REQ-TRACE-037's 32 hex.

### The comparison

`{ state, record?, detection?, unreadable?, delta? }` — `state` is `not-adopted`, `adopted` or `unreadable`; `delta`
is `{ newIds[], changedIds[], removedIds[], documentsAdded[], documentsChanged[], documentsRemoved[] }`, each list
sorted by REQ-TRACE-289's identifier order or by path (REQ-ADOPT-023).
