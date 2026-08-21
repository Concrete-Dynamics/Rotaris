from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from rotaris_core.reqtocode import SWR, traces

if TYPE_CHECKING:
    from pydantic import ValidationError


@traces(SWR.SWR_1827)
@dataclass(slots=True)
class CLIConfigLoadError(Exception):
    messages: list[str]


def format_config_validation_errors(exc: ValidationError) -> list[str]:
    messages: list[str] = []
    missing_model_fields: dict[str, set[str]] = {}

    for error in exc.errors(include_url=False):
        location = tuple(str(part) for part in error.get("loc", ()))
        if len(location) == 3 and location[0] == "models" and error.get("type") == "missing":
            missing_model_fields.setdefault(location[1], set()).add(location[2])
            continue

        path = ".".join(location) if location else "config"
        message = str(error.get("msg", "Invalid value"))
        if message == "Field required":
            message = "missing required field"
        messages.append(f"{path}: {message}")

    for model_name, fields in sorted(missing_model_fields.items()):
        formatted_fields = ", ".join(f"'{field}'" for field in sorted(fields))
        noun = "field" if len(fields) == 1 else "fields"
        messages.append(
            f"Model '{model_name}' is incomplete: missing required {noun} {formatted_fields}."
        )
        messages.append(
            "Model entries are full replacements across config scopes, "
            f"so any override for '{model_name}' must include {formatted_fields}."
        )

    return messages or ["Configuration is invalid."]


def wrap_config_validation_error(exc: ValidationError) -> CLIConfigLoadError:
    return CLIConfigLoadError(format_config_validation_errors(exc))
