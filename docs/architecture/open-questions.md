# Open questions and escalations

Everything the architecture record leaves unresolved, in three groups:

- **Escalations** — decisions that change what the product *is* for a user. These belong to the product
  owner, not to the architect. Each states the options and what each costs.
- **Specification questions** — places where the specification is silent, under-determined, or where two
  live requirements disagree. Each is raised rather than invented around.
- **Design-reference dependencies** — decisions that cannot be made without the approved visual design
  reference, which was not available to the architects who produced the slice proposals.

Nothing here blocks the Architecture Gate from being *held*. Several items block specific ADRs from
being *ratified*, and those are marked **blocking**.

## The parts

This record was one file of 16,723 lines until 2026-10-26, when it was split verbatim into the parts below so that
an agent can load the part that holds a question without the whole record ([the document budget](../README.md#the-document-budget)).
Nothing was reworded or renumbered; a question keeps its number and its `oq-<n>` anchor, now in its part. Each part
holds its entries in the order the single file had them. The counts and their history, which opened the single file,
are parts 01 and 02.

**A link that still reaches the index.** One document outside this change's reach cites a question as
`open-questions.md#oq-<n>`, the form before the split, so its anchor is kept here and points on to the part:
<a id="oq-400"></a>[OQ-400](open-questions/64-spikes-and-later-questions-31.md#oq-400), from
`implementation-conditions.md`. When that link is repointed to the part, this paragraph goes.

**Where a new entry goes.** A question is raised at the end of the last part, as the next free number. When that would
take the part past the budget, a new part is started with the next number, and a row is added below.

| Part | Section | Holds |
|---|---|---|
| [01](open-questions/01-counts-1.md) | Counts, and how they moved (1/2) | — |
| [02](open-questions/02-counts-2.md) | Counts, and how they moved (2/2) | — |
| [03](open-questions/03-escalations-1.md) | Escalations — product-owner decisions (1/3) | ESC-1 – ESC-12, ESC-14 – ESC-17 |
| [04](open-questions/04-escalations-2.md) | Escalations — product-owner decisions (2/3) | ESC-18 – ESC-25 |
| [05](open-questions/05-escalations-3.md) | Escalations — product-owner decisions (3/3) | ESC-26 – ESC-31 |
| [06](open-questions/06-specification-questions-1.md) | Specification questions (1/27) | OQ-3, OQ-11, OQ-26, OQ-27, OQ-1, OQ-5, OQ-38, OQ-21 – OQ-23, OQ-28, OQ-36 |
| [07](open-questions/07-specification-questions-2.md) | Specification questions (2/27) | OQ-2 – OQ-4, OQ-6 – OQ-17 |
| [08](open-questions/08-specification-questions-3.md) | Specification questions (3/27) | OQ-18 – OQ-20, OQ-24 – OQ-27, OQ-29, OQ-32 – OQ-35, OQ-37, OQ-39, OQ-40 |
| [09](open-questions/09-specification-questions-4.md) | Specification questions (4/27) | OQ-41 – OQ-44 |
| [10](open-questions/10-specification-questions-5.md) | Specification questions (5/27) | OQ-45 – OQ-52 |
| [11](open-questions/11-specification-questions-6.md) | Specification questions (6/27) | OQ-53 – OQ-62 |
| [12](open-questions/12-specification-questions-7.md) | Specification questions (7/27) | OQ-63 – OQ-70 |
| [13](open-questions/13-specification-questions-8.md) | Specification questions (8/27) | OQ-71 – OQ-77 |
| [14](open-questions/14-specification-questions-9.md) | Specification questions (9/27) | OQ-78 – OQ-85 |
| [15](open-questions/15-specification-questions-10.md) | Specification questions (10/27) | OQ-86 – OQ-94 |
| [16](open-questions/16-specification-questions-11.md) | Specification questions (11/27) | OQ-95, OQ-96 |
| [17](open-questions/17-specification-questions-12.md) | Specification questions (12/27) | OQ-97 – OQ-99 |
| [18](open-questions/18-specification-questions-13.md) | Specification questions (13/27) | OQ-100 |
| [19](open-questions/19-specification-questions-14.md) | Specification questions (14/27) | OQ-101 |
| [20](open-questions/20-specification-questions-15.md) | Specification questions (15/27) | OQ-102 |
| [21](open-questions/21-specification-questions-16.md) | Specification questions (16/27) | OQ-103 |
| [22](open-questions/22-specification-questions-17.md) | Specification questions (17/27) | OQ-104, OQ-105 |
| [23](open-questions/23-specification-questions-18.md) | Specification questions (18/27) | OQ-106 – OQ-109 |
| [24](open-questions/24-specification-questions-19.md) | Specification questions (19/27) | OQ-110 – OQ-113 |
| [25](open-questions/25-specification-questions-20.md) | Specification questions (20/27) | OQ-114 – OQ-118 |
| [26](open-questions/26-specification-questions-21.md) | Specification questions (21/27) | OQ-119 – OQ-126 |
| [27](open-questions/27-specification-questions-22.md) | Specification questions (22/27) | OQ-127 – OQ-130 |
| [28](open-questions/28-specification-questions-23.md) | Specification questions (23/27) | OQ-131 – OQ-134 |
| [29](open-questions/29-specification-questions-24.md) | Specification questions (24/27) | OQ-135 – OQ-140 |
| [30](open-questions/30-specification-questions-25.md) | Specification questions (25/27) | OQ-141 – OQ-146 |
| [31](open-questions/31-specification-questions-26.md) | Specification questions (26/27) | OQ-147, OQ-151 – OQ-155 |
| [32](open-questions/32-specification-questions-27.md) | Specification questions (27/27) | OQ-156 |
| [33](open-questions/33-design-reference.md) | Design-reference dependencies | OQ-30, OQ-31 |
| [34](open-questions/34-spikes-and-later-questions-1.md) | Spikes, and the questions raised since (1/35) | — |
| [35](open-questions/35-spikes-and-later-questions-2.md) | Spikes, and the questions raised since (2/35) | — |
| [36](open-questions/36-spikes-and-later-questions-3.md) | Spikes, and the questions raised since (3/35) | OQ-148 – OQ-150, OQ-157 – OQ-160 |
| [37](open-questions/37-spikes-and-later-questions-4.md) | Spikes, and the questions raised since (4/35) | OQ-161 – OQ-163 |
| [38](open-questions/38-spikes-and-later-questions-5.md) | Spikes, and the questions raised since (5/35) | OQ-164 – OQ-166 |
| [39](open-questions/39-spikes-and-later-questions-6.md) | Spikes, and the questions raised since (6/35) | OQ-167 – OQ-171 |
| [40](open-questions/40-spikes-and-later-questions-7.md) | Spikes, and the questions raised since (7/35) | OQ-172 – OQ-177 |
| [41](open-questions/41-spikes-and-later-questions-8.md) | Spikes, and the questions raised since (8/35) | OQ-178 – OQ-184 |
| [42](open-questions/42-spikes-and-later-questions-9.md) | Spikes, and the questions raised since (9/35) | OQ-185 – OQ-191 |
| [43](open-questions/43-spikes-and-later-questions-10.md) | Spikes, and the questions raised since (10/35) | OQ-192 – OQ-199 |
| [44](open-questions/44-spikes-and-later-questions-11.md) | Spikes, and the questions raised since (11/35) | OQ-200 – OQ-205 |
| [45](open-questions/45-spikes-and-later-questions-12.md) | Spikes, and the questions raised since (12/35) | OQ-206 – OQ-210 |
| [46](open-questions/46-spikes-and-later-questions-13.md) | Spikes, and the questions raised since (13/35) | OQ-211 – OQ-213, OQ-218, OQ-220 |
| [47](open-questions/47-spikes-and-later-questions-14.md) | Spikes, and the questions raised since (14/35) | OQ-216, OQ-217, OQ-214 |
| [48](open-questions/48-spikes-and-later-questions-15.md) | Spikes, and the questions raised since (15/35) | OQ-215, OQ-219, OQ-224, OQ-223, OQ-225 |
| [49](open-questions/49-spikes-and-later-questions-16.md) | Spikes, and the questions raised since (16/35) | OQ-222, OQ-226, OQ-227, OQ-232 |
| [50](open-questions/50-spikes-and-later-questions-17.md) | Spikes, and the questions raised since (17/35) | OQ-231, OQ-230, OQ-233, OQ-234 |
| [51](open-questions/51-spikes-and-later-questions-18.md) | Spikes, and the questions raised since (18/35) | OQ-235 – OQ-239 |
| [52](open-questions/52-spikes-and-later-questions-19.md) | Spikes, and the questions raised since (19/35) | OQ-221, OQ-245 – OQ-247 |
| [53](open-questions/53-spikes-and-later-questions-20.md) | Spikes, and the questions raised since (20/35) | OQ-248, OQ-249, OQ-228, OQ-229 |
| [54](open-questions/54-spikes-and-later-questions-21.md) | Spikes, and the questions raised since (21/35) | OQ-250, OQ-252 – OQ-255 |
| [55](open-questions/55-spikes-and-later-questions-22.md) | Spikes, and the questions raised since (22/35) | OQ-256 – OQ-259 |
| [56](open-questions/56-spikes-and-later-questions-23.md) | Spikes, and the questions raised since (23/35) | OQ-260, OQ-261, OQ-271, OQ-262 – OQ-264 |
| [57](open-questions/57-spikes-and-later-questions-24.md) | Spikes, and the questions raised since (24/35) | OQ-265 – OQ-267, OQ-272 |
| [58](open-questions/58-spikes-and-later-questions-25.md) | Spikes, and the questions raised since (25/35) | OQ-280, OQ-273, OQ-279, OQ-278 |
| [59](open-questions/59-spikes-and-later-questions-26.md) | Spikes, and the questions raised since (26/35) | OQ-281, OQ-292 – OQ-294, OQ-282, OQ-283 |
| [60](open-questions/60-spikes-and-later-questions-27.md) | Spikes, and the questions raised since (27/35) | OQ-284, OQ-285, OQ-295 – OQ-297 |
| [61](open-questions/61-spikes-and-later-questions-28.md) | Spikes, and the questions raised since (28/35) | OQ-298 – OQ-302, OQ-311 |
| [62](open-questions/62-spikes-and-later-questions-29.md) | Spikes, and the questions raised since (29/35) | OQ-312, OQ-332, OQ-333 |
| [63](open-questions/63-spikes-and-later-questions-30.md) | Spikes, and the questions raised since (30/35) | OQ-361, OQ-331 |
| [64](open-questions/64-spikes-and-later-questions-31.md) | Spikes, and the questions raised since (31/35) | OQ-334, OQ-400 |
| [65](open-questions/65-spikes-and-later-questions-32.md) | Spikes, and the questions raised since (32/35) | OQ-362, OQ-363 |
| [66](open-questions/66-spikes-and-later-questions-33.md) | Spikes, and the questions raised since (33/35) | OQ-364, OQ-401, OQ-402 |
| [67](open-questions/67-spikes-and-later-questions-34.md) | Spikes, and the questions raised since (34/35) | OQ-386, OQ-370 |
| [68](open-questions/68-spikes-and-later-questions-35.md) | Spikes, and the questions raised since (35/35) | OQ-378, OQ-450 – OQ-459 |
| [69](open-questions/69-spikes-and-later-questions-36.md) | Spikes, and the questions raised since (36/36) | OQ-460, OQ-461, OQ-462 – OQ-468 |
