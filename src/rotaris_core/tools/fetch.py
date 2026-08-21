"""HTTP fetch tool, gated by the network egress policy (SWR-2505).

The host of every request — the one the agent asked for *and* every redirect
hop — is classified against :class:`NetworkEgressPolicy` before a socket is
opened.  ``follow_redirects`` is deliberately off: with it on, a permitted host
can 302 to a denied one and the check never runs again, which is the whole hole
this requirement exists to close.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any, Self
from urllib.parse import urljoin

import httpx
from openhands.sdk import Action, Observation, TextContent, ToolDefinition
from openhands.sdk.tool import ToolExecutor
from pydantic import Field

from rotaris_core.permissions.network import (
    EGRESS_ALLOW,
    EGRESS_DENY,
    NetworkEgressPolicy,
    normalize_host,
)
from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from collections.abc import Sequence


_FETCH_TOOL_DESCRIPTION = (
    "Fetch text content from a URL. Supports an optional hard timeout override; if omitted, "
    "the tool uses the runtime-configured default timeout. Errors return structured diagnostics."
)


class FetchAction(Action):
    url: str = Field(...)
    max_lines: int = Field(default=1000)
    from_line: int | None = Field(default=None)
    to_line: int | None = Field(default=None)
    timeout: float | None = Field(
        default=None,
        ge=0,
        description=(
            "Optional hard timeout in seconds for this HTTP request. If omitted, the tool uses "
            "its configured default timeout."
        ),
    )


class FetchObservation(Observation):
    url: str = Field(...)
    final_url: str = Field(...)
    status_code: int | None = Field(default=None)
    content_type: str | None = Field(default=None)
    truncated: bool = Field(default=False)
    failure_kind: str | None = Field(default=None)
    timeout_seconds: float | None = Field(default=None)
    error_class: str | None = Field(default=None)
    detail: str | None = Field(default=None)

    @property
    def to_llm_content(self) -> Sequence[TextContent]:
        if self.is_error and self.failure_kind is not None:
            diagnostic = {
                "url": self.url,
                "final_url": self.final_url,
                "status_code": self.status_code,
                "content_type": self.content_type,
                "truncated": self.truncated,
                "failure_kind": self.failure_kind,
                "timeout_seconds": self.timeout_seconds,
                "error_class": self.error_class,
                "detail": self.detail,
            }
            diagnostic = {key: value for key, value in diagnostic.items() if value is not None}
            diag_json = json.dumps(diagnostic, sort_keys=True)
            text = f"{self.ERROR_MESSAGE_HEADER}[fetch_diagnostic]\n{diag_json}"
            if self.text:
                text += f"\n\n[fetch_output]\n{self.text}"
            return [TextContent(text=text)]

        header = [
            f"url: {self.url}",
            f"final_url: {self.final_url}",
            f"status_code: {self.status_code}",
            f"content_type: {self.content_type}",
            f"truncated: {self.truncated}",
        ]
        text = "\n".join(header + ([self.text] if self.text else []))
        if self.is_error:
            text = f"{self.ERROR_MESSAGE_HEADER}{text}"
        return [TextContent(text=text)]


#: Stable, machine-readable ``failure_kind`` values for an egress refusal, so
#: the event stream (SWR-1829) and the UI branch on a constant instead of
#: pattern-matching prose.  They are deliberately distinct from ``network_error``
#: and ``timeout``: a refusal is a policy outcome the agent must re-plan around,
#: not a transient fault it should retry.
EGRESS_DENIED = "egress_denied"
EGRESS_REDIRECT_DENIED = "egress_redirect_denied"
EGRESS_POLICY_ERROR = "egress_policy_error"
TOO_MANY_REDIRECTS = "too_many_redirects"

#: Redirect hops followed before giving up.  Matches httpx's own default.
MAX_REDIRECTS = 20


@traces(
    SWR.SWR_527,
    SWR.SWR_528,
    SWR.SWR_529,
    SWR.SWR_530,
    SWR.SWR_531,
    SWR.SWR_532,
    SWR.SWR_2505,
)
class FetchExecutor(ToolExecutor[FetchAction, FetchObservation]):
    """Fetch one URL, refusing any hop the egress policy does not permit.

    *egress_policy* is a constructor argument rather than a module-level
    singleton: there is no ambient config accessor an executor can reach (the
    tool factory in ``agents/tool_registration.py`` is the only place that holds
    a :class:`RotarisConfig`), and a second process-global registry would be a
    worse seam than an explicit parameter.  The default is permissive so a
    caller that has no configuration to offer is not silently broken; the mode
    presets still route a remote fetch through the permission engine's ``ask``,
    so "permissive here" is not "ungated overall".
    """

    def __init__(
        self,
        timeout: float = 10.0,
        egress_policy: NetworkEgressPolicy | None = None,
    ) -> None:
        self.timeout = timeout
        self.egress_policy = egress_policy or NetworkEgressPolicy.permissive()

    def _error_observation(
        self,
        *,
        action: FetchAction,
        failure_kind: str,
        detail: str,
        timeout_seconds: float | None,
        error_class: str,
    ) -> FetchObservation:
        return FetchObservation.from_text(
            detail,
            is_error=True,
            url=action.url,
            final_url=action.url,
            status_code=None,
            content_type=None,
            truncated=False,
            failure_kind=failure_kind,
            timeout_seconds=timeout_seconds,
            error_class=error_class,
            detail=detail,
        )

    def _egress_refusal(
        self,
        *,
        action: FetchAction,
        url: str,
        failure_kind: str,
        detail: str,
    ) -> FetchObservation:
        """A refusal that names the blocked host and the policy that blocked it."""
        return FetchObservation.from_text(
            detail,
            is_error=True,
            url=action.url,
            final_url=url,
            status_code=None,
            content_type=None,
            truncated=False,
            failure_kind=failure_kind,
            timeout_seconds=None,
            error_class="NetworkEgressDenied",
            detail=detail,
        )

    def _refuse_if_denied(
        self,
        action: FetchAction,
        url: str,
        *,
        permitted_hosts: set[str],
    ) -> FetchObservation | None:
        """Classify *url*'s host; return a refusal observation, or ``None`` to proceed.

        ``deny`` always refuses, on the first request and on every hop.

        ``ask`` is the mode's approval path, and that approval belongs to the
        permission engine, not to this executor: ``presets._fetch_rules`` gates
        the URL the agent named, so by the time a call reaches here the engine
        has already resolved an ``ask`` for that host — hence *permitted_hosts*,
        seeded with it.  A redirect onto a host the engine never saw is a
        different matter: there is no way to prompt a human mid-request without
        holding a connection open against the approval timeout, so the hop is
        refused and the agent is told which host to request explicitly, which
        then goes through the engine normally.  A redirect that stays on an
        already-permitted host (``/x`` → ``/x/``, ``http`` → ``https``) is not
        re-gated, which keeps ordinary redirects working under the shipped
        ``ask`` default.
        """
        host = normalize_host(url)
        try:
            verdict = self.egress_policy.classify(url)
        except ValueError as exc:
            return self._egress_refusal(
                action=action,
                url=url,
                failure_kind=EGRESS_POLICY_ERROR,
                detail=(
                    f"The network egress policy could not be applied to {host or url!r} "
                    f"and the request was refused: {exc}"
                ),
            )
        if verdict == EGRESS_DENY:
            return self._egress_refusal(
                action=action,
                url=url,
                failure_kind=(EGRESS_DENIED if host in permitted_hosts else EGRESS_REDIRECT_DENIED),
                detail=(
                    f"Network egress to {host or url!r} was refused: the egress policy "
                    f"(runtime.network_egress_policy) resolves that host to 'deny'."
                ),
            )
        if verdict == EGRESS_ALLOW or host in permitted_hosts:
            permitted_hosts.add(host)
            return None
        return self._egress_refusal(
            action=action,
            url=url,
            failure_kind=EGRESS_REDIRECT_DENIED,
            detail=(
                f"Network egress to {host or url!r} was refused: the request was "
                f"redirected there from {action.url!r} and the egress policy resolves "
                f"that host to '{verdict}', which needs approval this host never "
                "granted. Request the final host directly if it is genuinely needed."
            ),
        )

    @staticmethod
    def _redirect_target(response: httpx.Response, current: str) -> str | None:
        """Absolute URL of the next hop, or ``None`` when there is none."""
        if not response.is_redirect:
            return None
        next_request = getattr(response, "next_request", None)
        if next_request is not None:
            return str(next_request.url)
        location = response.headers.get("location")
        return urljoin(current, location) if location else None

    def __call__(self, action: FetchAction, conversation: object = None) -> FetchObservation:
        effective_timeout = action.timeout if action.timeout is not None else self.timeout
        url = action.url
        # Seeded with the host the agent named: the permission engine already
        # resolved the mode's decision for exactly that host (see
        # ``_refuse_if_denied``).  Every other host in the chain is new.
        permitted_hosts = {normalize_host(url)}
        refusal = self._refuse_if_denied(action, url, permitted_hosts=permitted_hosts)
        if refusal is not None:
            return refusal
        try:
            # follow_redirects=False: every hop is re-classified below, because a
            # permitted host redirecting to a denied one must not be followed.
            with httpx.Client(timeout=effective_timeout, follow_redirects=False) as client:
                response = client.get(url)
                for _ in range(MAX_REDIRECTS):
                    target = self._redirect_target(response, url)
                    if target is None:
                        break
                    refusal = self._refuse_if_denied(
                        action,
                        target,
                        permitted_hosts=permitted_hosts,
                    )
                    if refusal is not None:
                        return refusal
                    url = target
                    response = client.get(url)
                else:
                    if self._redirect_target(response, url) is not None:
                        return self._error_observation(
                            action=action,
                            failure_kind=TOO_MANY_REDIRECTS,
                            detail=(
                                f"HTTP fetch stopped after {MAX_REDIRECTS} redirects "
                                f"without reaching a final response."
                            ),
                            timeout_seconds=None,
                            error_class="TooManyRedirects",
                        )
        except httpx.TimeoutException as exc:
            return self._error_observation(
                action=action,
                failure_kind="timeout",
                detail=f"HTTP fetch timed out after {effective_timeout} seconds: {exc}",
                timeout_seconds=effective_timeout,
                error_class=type(exc).__name__,
            )
        except httpx.HTTPError as exc:
            return self._error_observation(
                action=action,
                failure_kind="network_error",
                detail=f"HTTP fetch failed before a response was received: {exc}",
                timeout_seconds=effective_timeout,
                error_class=type(exc).__name__,
            )

        lines = response.text.splitlines()
        start = (action.from_line - 1) if action.from_line else 0
        end = action.to_line if action.to_line is not None else len(lines)
        selected = lines[start:end]
        truncated = len(selected) > action.max_lines
        if truncated:
            selected = selected[: action.max_lines]
        text = "\n".join(selected)
        is_http_error = response.status_code >= 400
        failure_kind = "http_error" if is_http_error else None
        detail = (
            f"HTTP request completed with status code {response.status_code}."
            if is_http_error
            else None
        )
        return FetchObservation.from_text(
            text,
            is_error=is_http_error,
            url=action.url,
            final_url=str(response.url),
            status_code=response.status_code,
            content_type=response.headers.get("content-type"),
            truncated=truncated,
            failure_kind=failure_kind,
            timeout_seconds=effective_timeout if is_http_error else None,
            error_class=None,
            detail=detail,
        )


class FetchTool(ToolDefinition[FetchAction, FetchObservation]):
    @classmethod
    def create(cls, conv_state: object = None, **kwargs: Any) -> Sequence[Self]:
        return [
            cls(
                description=_FETCH_TOOL_DESCRIPTION,
                action_type=FetchAction,
                observation_type=FetchObservation,
                executor=FetchExecutor(
                    timeout=kwargs.get("timeout", 10.0),
                    egress_policy=kwargs.get("egress_policy"),
                ),
            ),
        ]
