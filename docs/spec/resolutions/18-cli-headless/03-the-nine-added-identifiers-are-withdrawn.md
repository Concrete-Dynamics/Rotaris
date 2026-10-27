# Resolution Record — Domain 18, Command-Line and Headless Entry Points — The nine added identifiers are withdrawn

Part 3 of 4 of [domain 18's resolutions](../18-cli-headless.md), which indexes every part.

## The nine added identifiers are withdrawn

This pass ran against a namespace that had already been declared withdrawn: the product owner scoped
the product to one Electron desktop application on 2026-08-30, retiring this domain and closing the
`REQ-CLI` series. Minting REQ-CLI-229 through REQ-CLI-237 into a closed series was the error, not the
behavior each of them fixed. All nine are therefore **withdrawn in place** in
[`../18-cli-headless.md`](../../18-cli-headless.md), each naming the desktop requirement that carries the
capability, and no further `REQ-CLI` identifier may be added to that document. The series ends at
REQ-CLI-237.

| ID | Added | Capability now carried by |
| --- | --- | --- |
| REQ-CLI-229 | Rejection of `--background` with no task on the interactive-capable surface | REQ-SESSION-184 (a launch that names no task is refused), REQ-SESSION-190 (sending a run to the background, and the refusal when there is no run to send) |
| REQ-CLI-230 | Git branch-name sanitization rules | REQ-GIT-009 (normal form, rejection rules, and the `Invalid Git branch name: <value>` refusal), REQ-GIT-139 (slugging of derived names), REQ-GIT-010 (collision suffixes) |
| REQ-CLI-231 | The closed set of configuration schema problem phrases | REQ-CONFIG-237 (one line per problem, dotted path, plain-language wording); any closed phrase vocabulary is domain 15's to fix |
| REQ-CLI-232 | Payload fields for the remaining version-1 event types | REQ-EVENTS-041 with the per-type guarantees that follow it, over the event catalog in domain 20's data and formats section |
| REQ-CLI-233 | Emission conditions for the later-added event types | REQ-EVENTS-041 with REQ-EVENTS-043, REQ-EVENTS-044, REQ-EVENTS-045, REQ-EVENTS-046, REQ-EVENTS-047 and REQ-EVENTS-049 |
| REQ-CLI-234 | Endpoint and base-URL normalization rules | REQ-PROVIDER-053 |
| REQ-CLI-235 | The single masking rule for rendered secrets | REQ-PROVIDER-107 |
| REQ-CLI-236 | The canonical unrecognized-provider report and exit code | REQ-PROVIDER-142 (sign-in) and REQ-PROVIDER-147 (catalog refresh); the exit code goes with the surface, REQ-PROVIDER-139 having been withdrawn on the same ground |
| REQ-CLI-237 | The trajectory and batch export document schemas | REQ-EVENTS-132, REQ-EVENTS-133, REQ-EVENTS-136, REQ-EVENTS-140 (trajectory document) and REQ-EVENTS-144 (batch document) |
