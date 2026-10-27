# ADR-0020 — Terminal execution: PTY-backed persistent foreground sessions, pipe-backed background sessions — Consequences accepted

Part 5 of 15 of [ADR-0020](../0020-terminal-execution.md), which indexes every part.

## Consequences accepted

1. The exit status of a foreground command is **derived from a marker protocol rather than from a
   wait**. A pathological command could therefore forge one. The nonce must be unguessable per call,
   and the protocol must be tested against a command that echoes attacker-chosen text.
2. Under a PTY, stdout and stderr are **merged** and the shell echoes the submitted line. The capture
   handed to the agent must strip the echoed command and the marker frames; `REQ-TOOLS-113`'s
   output-derived warning checks then run over the cleaned text, or they will match the command line
   itself. Under the accepted OQ-13 amendment (2026-09-07), `REQ-TOOLS-098`'s empty
   soft-pause advisory states that stdout and stderr share the captured stream and offers polling
   or interruption. Redirection advice is reserved for a backend that excludes stderr from capture.
3. `background=true` gives pipes, not a PTY, so a background session's terminal tab has no real
   terminal to resize. `REQ-TOOLS-128` and `REQ-SHELL-106` already anticipate this: a resize always
   resizes the emulated screen, even when the backend is gone, and then the real terminal when
   possible.
4. `node-pty` is a native module, so ADR-0002's rebuild-and-unpack obligation is load-bearing, and the
   ConPTY floor of Windows 10 1809 becomes a platform requirement ADR-0054 must state.
5. Foreground output is capped at 100,000 characters per call truncated from the **oldest** end, and
   background output buffered to 1 MB per session truncated the same direction with the read cursor
   adjusted (`REQ-TOOLS-097`, `REQ-TOOLS-100`, `REQ-TOOLS-108`).
