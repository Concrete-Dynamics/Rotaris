# Rotaris requirement document format

Use this format for new requirement documents.

```markdown
# Requirements - Rotaris - <Feature Title>

**Status:** Not Started
**Date:** <YYYY-MM-DD HH:MM UTC>
**Source:** User Request

---

## Description

<One or more paragraphs explaining the feature, why it exists, and the expected result. Start with the product/runtime need, then describe the intended contract.>

**Problem being solved:**

<Describe the concrete problem, ambiguity, missing capability, or user pain.>

**Current behaviour:**

- <Current state, if known.>
- <Use "Unknown - repository inspection required" only when the current state cannot be checked.>

**What needs to change:**

1. <Required change.>
2. <Required change.>
3. <Required change.>

## Requirements

| ID | Title | Description | Status |
|----|-------|-------------|--------|
| REQ-YYYYMMDD-HHMMSS-001 | <Short Title> | The system MUST <testable behavior>. | Not Started |
| REQ-YYYYMMDD-HHMMSS-002 | <Short Title> | The system MUST <testable behavior>. | Not Started |
| REQ-YYYYMMDD-HHMMSS-NF-001 | <Nonfunctional Title> | The implementation SHOULD/MUST <performance, reliability, security, privacy, compatibility, or usability constraint>. | Not Started |
| REQ-YYYYMMDD-HHMMSS-T-001 | Test: <Test Title> | Automated or manual tests MUST verify <observable completion condition>. | Not Started |

## Implementation Notes

**Requirements Document:**

<Explain how this document should be used by implementers. Include assumptions that were made because the initial feature description was incomplete.>

**Dependencies:**

- Depends on: `<requirement-file-or-module>` - <reason>
- Blocks: <implementation, plan, or follow-up work>

**Resolved Conflicts:**

Prior Requirement | Conflict | Resolution
--- | --- | ---
`<requirement-file>` | <Overlap or possible contradiction.> | <How this document extends, narrows, or supersedes it.>

**Out of Scope:**

- <Explicit exclusion.>
- <Explicit exclusion.>

**Notes:**

- <Useful implementation or review note.>

## Acceptance Criteria

**Acceptance Criteria:**

- [ ] <User/system observable criterion.>
- [ ] <Verification criterion tied to a requirement row.>
- [ ] <Failure, edge case, or regression criterion.>

## Definition of Done

Implementation satisfies the requirement rows in this document. Relevant automated or manual verification is documented before the status is moved to Complete. Traceability references remain stable for any tests or follow-up work that cite these requirement IDs.
```

## Style rules

- Use `Rotaris` exactly in the title.
- Use `behaviour` only when matching existing text; otherwise prefer `behavior` for new prose consistency is less important than clarity.
- Requirement titles should be short noun phrases.
- Requirement descriptions should be one sentence when possible, but can use semicolons for multi-part contracts.
- Acceptance criteria should describe externally verifiable outcomes, not internal implementation hopes.
- `Implementation Notes` may contain assumptions, dependencies, conflicts, out-of-scope items, and migration notes.
- Avoid adding priority columns unless an existing document being edited already uses them. The repository's common table is `ID | Title | Description | Status`.
