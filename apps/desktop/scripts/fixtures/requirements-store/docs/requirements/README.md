# The fixture requirement store

This directory is the Part AJ proof's requirement store: an epic with six children, one multi-identifier
document, one deprecated requirement, and this README, which carries no frontmatter and is ignored silently
(REQ-TRACE-003). The proof copies the whole fixture root before it runs anything, so nothing here is ever
modified in place.

Planted findings, one per check of REQ-TRACE-091, in order: the committed artifact is stale; the debt baseline
holds a malformed line; REQ-106 is technical without an origin; `src/refs-missing.ts` names REQ-150, which does
not exist; REQ-300 is deprecated and still referenced; REQ-102 has no implementation trace; REQ-103 has no
covering test; the debt baseline's REQ-101 entry is satisfied; `tests/covers.ts` carries an unknown legacy
identifier; `src/legacy/tool.py` is an orphan module under the project's Python convention; and
`tests/legacy/test_tool.py::test_orphan` is an orphan test under the same convention.
