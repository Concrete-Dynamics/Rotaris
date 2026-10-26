# Design Brief — Rotaris Desktop Interface

**Status:** approved design language; information architecture governed by the specification.
**Audience:** the UI architect and whoever implements the interface after the Architecture Gate.
**Scope:** one Electron desktop application. There is no command-line interface, no terminal user
interface, and no embedding API (`docs/spec/README.md`; domains 17 and 18 are retired).

This document does four things: it states the design language concretely enough to build a themed
component from, it states the adoption rule and why it exists, it reconciles the design material
against `REQ-SHELL-023`, and it maps the component inventory onto the affordances the specification
demands.

---

## Parts

Since 2026-10-26 the rest of this document is in [`README/`](README/), moved verbatim and in order so that one
part loads without the rest ([the document budget](../README.md#the-document-budget)). Every anchor kept its text; a link to
one now names its part.

| Part | What it holds |
|---|---|
| [01](README/01-1-the-design-language.md) | 1. The design language; 1.1 The ground; 1.2 The accent; 1.3 The three-axis state colours; 1.4 Type; 1.5 Spacing; 1.6 Radii; 1.7 Borders and elevation; 1.8 Motion; 1.9 Iconography; 1.10 Motif; 1.11 Copy voice; 1.12 Two wiring notes carried over from the import |
| [02](README/02-2-the-adoption-rule.md) | 2. The adoption rule |
| [03](README/03-3-view-reconciliation.md) | 3. View reconciliation; 3.1 Specified view → design material; 3.2 Specified views and surfaces with no design; 3.3 Design screens with no specified counterpart |
| [04](README/04-4-component-inventory-against-the-specification.md) | 4. Component inventory against the specification; 4.1 Affordance → component; 4.2 Affordances with no component at all |
| [05](README/05-5-acceptance-items-the-design-language-must-be.md) | 5. Acceptance items the design language must be measured against |
| [06](README/06-6-reference.md) | 6. Reference |
| [07](README/07-7-fidelity-consult-before-maintain-after.md) | 7. Fidelity — consult before, maintain after; 7.1 What the first reading of this obligation found — 2026-09-08; 7.2 The repair — 2026-09-09 (Part AI); 7.3 Telling two working agents apart — 2026-09-16 (`PD-CHAT-004` rev. 2, `PD-CHAT-005`); 7.4 A tool row says what it is doing — 2026-10-24 (`REQ-CHAT-175` – `REQ-CHAT-178`) |
