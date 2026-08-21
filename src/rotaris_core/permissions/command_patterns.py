"""Command-level permission patterns for terminal-class tools (SWR-2502).

SWR-2501 left :attr:`PermissionRule.matcher` unpopulated; this module fills it.
A pattern such as ``uv run pytest *`` is compiled into a token-prefix matcher —
never a substring search, so ``git status`` cannot be satisfied by
``git status-and-then-something-else``.

Compound command lines are decomposed on the shell operators (``&&``, ``||``,
``;``, ``|``, ``&``, newline) and every segment is matched independently: a deny
pattern therefore still catches the destructive half of ``git status && rm -rf /``.
Segments that cannot be tokenised confidently — unbalanced quotes, command
substitution, ``sh -c`` style indirection — are flagged, and
:func:`escalation_matcher` turns them into an ``ask``.  Nothing in this module
can turn an unmatchable command into an ``allow``.

The starter rule set (:data:`DESTRUCTIVE_COMMAND_RULES`) is a documented default
for SWR-2503 to compose presets from; it is deliberately *not* wired into
:data:`~rotaris_core.permissions.engine.ALLOW_ALL_POLICY`, so runtime behaviour is
unchanged until mode presets land.
"""

from __future__ import annotations

import shlex
from dataclasses import dataclass
from fnmatch import fnmatchcase
from functools import lru_cache

from rotaris_core.permissions.engine import (
    CommandMatcher,
    Decision,
    MalformedPolicyError,
    PermissionRule,
)
from rotaris_core.reqtocode import SWR, traces

#: Shell operators that separate one command from the next, longest first so
#: ``&&`` is never mistaken for two background operators.
_SEPARATORS: tuple[str, ...] = ("&&", "||", ";;", ";", "|", "&", "\n")

#: Token that matches "any remaining arguments" when it trails a pattern.
_TAIL = "*"

#: Heads whose real command lives in an argument string we do not interpret.
_INDIRECTION_HEADS = frozenset({"eval", "exec", "source", ".", "xargs", "env", "nohup", "time"})

#: Interpreters that execute a script from stdin or from ``-c``.
_SHELL_HEADS = frozenset({"sh", "bash", "zsh", "dash", "ksh", "fish", "cmd", "powershell", "pwsh"})

#: Redirection tokens; everything from here on is plumbing, not command shape.
_REDIRECTIONS = ("<", ">", ">>", "2>", "2>>", "&>", "1>", "<<", "<<<")


@traces(SWR.SWR_2502)
@dataclass(frozen=True)
class CommandSegment:
    """One command inside a possibly-compound command line."""

    raw: str
    tokens: tuple[str, ...]
    #: ``False`` when the segment's real effect cannot be read off its tokens.
    confident: bool
    #: Why the segment is not confident; empty when it is.
    uncertainty: str = ""
    #: The operator that introduced this segment (``"|"``, ``"&&"``, …).
    preceding_operator: str | None = None

    @property
    def head(self) -> str:
        return self.tokens[0] if self.tokens else ""


@traces(SWR.SWR_2502)
@dataclass(frozen=True)
class CommandPattern:
    """A compiled command pattern, matched against a segment's leading tokens.

    Every pattern token must glob-match (``fnmatch``, case-sensitive) the token
    at the same position.  A trailing ``*`` additionally absorbs any number of
    remaining tokens — including none, so ``rm -rf *`` matches a bare ``rm -rf``.
    Without a trailing ``*`` the token counts must be equal.
    """

    tokens: tuple[str, ...]
    open_tail: bool
    source: str

    @classmethod
    def parse(cls, text: str) -> CommandPattern:
        """Compile *text*; raise :class:`MalformedPolicyError` if it cannot be read."""
        try:
            tokens = tuple(shlex.split(text))
        except ValueError as exc:
            raise MalformedPolicyError(
                f"Command pattern {text!r} is not tokenisable: {exc}"
            ) from exc
        if not tokens:
            raise MalformedPolicyError(f"Command pattern {text!r} is empty")
        open_tail = tokens[-1] == _TAIL
        if open_tail:
            tokens = tokens[:-1]
        return cls(tokens=tokens, open_tail=open_tail, source=text)

    def matches(self, segment: CommandSegment) -> bool:
        """Whether this pattern applies to *segment*."""
        candidate = segment.tokens
        if len(candidate) < len(self.tokens):
            return False
        if not self.open_tail and len(candidate) != len(self.tokens):
            return False
        return all(
            fnmatchcase(actual, expected)
            for expected, actual in zip(self.tokens, candidate, strict=False)
        )


@traces(SWR.SWR_2502)
@lru_cache(maxsize=512)
def parse_command(command: str) -> tuple[CommandSegment, ...]:
    """Decompose *command* into its segments.  Never raises.

    An unparseable line still yields one segment — an unconfident one — so
    callers always have something to escalate on.
    """
    segments: list[CommandSegment] = []
    for raw, operator in _split_segments(command):
        stripped = raw.strip()
        if not stripped:
            continue
        segments.append(_analyse_segment(stripped, operator))
    return tuple(segments)


def _split_segments(command: str) -> list[tuple[str, str | None]]:
    """Split on shell operators that sit outside quotes.  Keeps the operators."""
    parts: list[tuple[str, str | None]] = []
    current: list[str] = []
    operator: str | None = None
    quote: str | None = None
    index = 0
    while index < len(command):
        char = command[index]
        if quote is not None:
            current.append(char)
            if char == "\\" and quote == '"' and index + 1 < len(command):
                current.append(command[index + 1])
                index += 2
                continue
            if char == quote:
                quote = None
            index += 1
            continue
        if char in {"'", '"'}:
            quote = char
            current.append(char)
            index += 1
            continue
        if char == "\\" and index + 1 < len(command):
            current.append(char)
            current.append(command[index + 1])
            index += 2
            continue
        separator = next((sep for sep in _SEPARATORS if command.startswith(sep, index)), None)
        if separator is not None:
            parts.append(("".join(current), operator))
            current = []
            operator = separator
            index += len(separator)
            continue
        current.append(char)
        index += 1
    parts.append(("".join(current), operator))
    return parts


def _analyse_segment(raw: str, operator: str | None) -> CommandSegment:
    if _has_substitution(raw):
        return CommandSegment(
            raw=raw,
            tokens=(),
            confident=False,
            uncertainty="contains command substitution",
            preceding_operator=operator,
        )
    try:
        tokens = tuple(shlex.split(raw))
    except ValueError as exc:
        return CommandSegment(
            raw=raw,
            tokens=(),
            confident=False,
            uncertainty=f"is not tokenisable ({exc})",
            preceding_operator=operator,
        )
    tokens = _strip_redirections(tokens)
    if not tokens:
        return CommandSegment(
            raw=raw,
            tokens=(),
            confident=False,
            uncertainty="carries no command",
            preceding_operator=operator,
        )
    uncertainty = _indirection_reason(tokens)
    return CommandSegment(
        raw=raw,
        tokens=tokens,
        confident=uncertainty == "",
        uncertainty=uncertainty,
        preceding_operator=operator,
    )


def _has_substitution(raw: str) -> bool:
    """Detect ``$(...)`` / backtick substitution outside single quotes."""
    quote: str | None = None
    index = 0
    while index < len(raw):
        char = raw[index]
        if quote is not None:
            if char == quote:
                quote = None
            elif quote == '"' and (char == "`" or raw.startswith("$(", index)):
                return True
            index += 1
            continue
        if char in {"'", '"'}:
            quote = char
        elif char == "`" or raw.startswith("$(", index):
            return True
        index += 1
    return False


def _strip_redirections(tokens: tuple[str, ...]) -> tuple[str, ...]:
    for position, token in enumerate(tokens):
        if token in _REDIRECTIONS or token.startswith((">", "<")):
            return tokens[:position]
    return tokens


def _indirection_reason(tokens: tuple[str, ...]) -> str:
    head = tokens[0]
    if head in _INDIRECTION_HEADS:
        return f"runs another command through '{head}'"
    if head in _SHELL_HEADS:
        if any(token in {"-c", "-Command", "/c", "/C"} for token in tokens[1:]):
            return f"runs an inline script through '{head}'"
        if len(tokens) == 1:
            return f"executes a script through '{head}'"
    return ""


@traces(SWR.SWR_2502)
def compile_patterns(patterns: tuple[str, ...] | list[str]) -> tuple[CommandPattern, ...]:
    """Compile every pattern up-front so a typo fails loudly at policy build time."""
    return tuple(CommandPattern.parse(pattern) for pattern in patterns)


@traces(SWR.SWR_2502)
def command_matcher(*patterns: str) -> CommandMatcher:
    """A :data:`CommandMatcher` that fires when *any* segment matches *any* pattern.

    "Any segment" is what makes a deny rule catch the second half of
    ``git status && rm -rf /``.
    """
    compiled = compile_patterns(patterns)

    def matches(command: str) -> bool:
        return any(
            pattern.matches(segment) for segment in parse_command(command) for pattern in compiled
        )

    return matches


@traces(SWR.SWR_2502)
def escalation_matcher() -> CommandMatcher:
    """A matcher that fires when any segment could not be read confidently.

    Paired with an ``ask`` rule this is the spec's "never silently allow an
    undecidable command"; with no approval UI the engine's fail-safe resolver
    turns it into a deny.
    """

    def matches(command: str) -> bool:
        segments = parse_command(command)
        if not segments:
            return bool(command.strip())
        return any(not segment.confident for segment in segments)

    return matches


@traces(SWR.SWR_2502)
def pipe_to_shell_matcher() -> CommandMatcher:
    """A matcher for ``curl … | sh`` style installs: a shell fed by a pipe."""

    def matches(command: str) -> bool:
        return any(
            segment.preceding_operator == "|" and segment.head in _SHELL_HEADS
            for segment in parse_command(command)
        )

    return matches


def _rule(
    rule_id: str,
    decision: Decision,
    description: str,
    matcher: CommandMatcher,
) -> PermissionRule:
    return PermissionRule(
        rule_id=rule_id,
        decision=decision,
        matcher=matcher,
        description=description,
    )


#: Documented starter set for destructive terminal operations.
#:
#: Ordered deny-before-ask, matching the engine's first-match-wins resolution.
#: It is a *starter* set, not a containment boundary: flag spellings a shell
#: accepts (``rm -fr``, ``rm -r -f``) are enumerated, not inferred, and anything
#: it cannot read confidently falls through to ``starter:ask-unreadable-command``.
#: SWR-2503 composes these into the mode presets; nothing here is active on its own.
DESTRUCTIVE_COMMAND_RULES: tuple[PermissionRule, ...] = (
    _rule(
        "starter:deny-recursive-delete",
        Decision.DENY,
        "recursive or forced delete",
        command_matcher(
            "rm -rf *",
            "rm -fr *",
            "rm -Rf *",
            "rm -r -f *",
            "rm -f -r *",
            "rmdir /s *",
            "rd /s *",
            "del /f *",
        ),
    ),
    _rule(
        "starter:deny-privilege-escalation",
        Decision.DENY,
        "privilege escalation",
        command_matcher("sudo *", "doas *", "su *", "runas *"),
    ),
    _rule(
        "starter:deny-force-push",
        Decision.DENY,
        "history-rewriting push",
        command_matcher("git push --force *", "git push -f *", "git push --delete *"),
    ),
    _rule(
        "starter:deny-package-publish",
        Decision.DENY,
        "publishing a package to a public registry",
        command_matcher(
            "npm publish *",
            "yarn publish *",
            "pnpm publish *",
            "uv publish *",
            "twine upload *",
            "cargo publish *",
            "gh release create *",
        ),
    ),
    _rule(
        "starter:deny-pipe-to-shell",
        Decision.DENY,
        "piping downloaded content into a shell",
        pipe_to_shell_matcher(),
    ),
    _rule(
        "starter:ask-unreadable-command",
        Decision.ASK,
        "command whose effect cannot be determined statically",
        escalation_matcher(),
    ),
    _rule(
        "starter:ask-history-rewrite",
        Decision.ASK,
        "discards uncommitted or committed work",
        command_matcher(
            "git reset --hard *",
            "git clean -fd *",
            "git clean -df *",
            "git checkout -- *",
            "git rebase *",
            "git filter-branch *",
        ),
    ),
    _rule(
        "starter:ask-dependency-install",
        Decision.ASK,
        "installs third-party code",
        command_matcher(
            "pip install *",
            "uv pip install *",
            "uv add *",
            "npm install *",
            "npm i *",
            "yarn add *",
            "pnpm add *",
            "cargo install *",
            "brew install *",
            "apt-get install *",
        ),
    ),
    _rule(
        "starter:ask-container-control",
        Decision.ASK,
        "controls container or host runtime state",
        command_matcher("docker *", "podman *", "kubectl *", "systemctl *", "Remove-Item *"),
    ),
)
