# 13 — Version Compatibility

> Perspective: Version gates, what blocks vs. warns, and upgrade coordination rules.
> Diagram type: Flowchart

---

## SDK and Dependency Version Gates

```mermaid
flowchart TD
    INSTALL["pip install rotaris-core"]
    CHECK_SDK{"openhands-sdk\n>=1.21.0,<1.27.0?"}
    CHECK_TOOLS{"openhands-tools\n>=1.21.0,<1.27.0?"}
    BLOCK_SDK(["Install blocked\n(pip version resolver)"])
    BLOCK_TOOLS(["Install blocked\n(pip version resolver)"])
    OK_DEP["Dependencies satisfied"]

    INSTALL --> CHECK_SDK
    CHECK_SDK -->|"outside range"| BLOCK_SDK
    CHECK_SDK -->|"in range"| CHECK_TOOLS
    CHECK_TOOLS -->|"outside range"| BLOCK_TOOLS
    CHECK_TOOLS -->|"in range"| OK_DEP
```

## Session Schema Version Gate

```mermaid
flowchart TD
    LOAD["SessionManager.load_session()"]
    READ["Read state/resume.json\nor legacy snapshot.json"]
    CHECK_VER{"snapshot.schema_version\n> SESSION_SCHEMA_VERSION?"}
    COMPAT{"Current/older schema\nvalidates with defaults?"}
    LOADED(["Session loaded\n(defaults fill gaps)"])
    FAIL(["Raise unsupported schema\n(future snapshot)"])

    LOAD --> READ --> CHECK_VER
    CHECK_VER -->|"yes"| FAIL
    CHECK_VER -->|"no"| COMPAT
    COMPAT -->|"valid"| LOADED
    COMPAT -->|"required field missing"| FAIL
```

## Upgrade Rules

| Rule                                | Scope                    | Trigger                                                      |
| ----------------------------------- | ------------------------ | ------------------------------------------------------------ |
| `SESSION_SCHEMA_VERSION` bump       | `session/state.py`       | Only on breaking changes (removing/renaming required fields) |
| New `SessionState` field            | `session/state.py`       | Always add a default value — never require it                |
| `pyproject.toml` version bump       | repo-wide                | After every feature addition or bug fix (semver)             |
| SDK/tool upper bound `<1.27.0`      | `pyproject.toml`         | Pins to the OpenHands SDK/tools minor range this integration is tested against |
