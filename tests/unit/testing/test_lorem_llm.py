import pytest

from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.testing.lorem_llm import (
    LoremLLM,
    LoremScriptExhaustedError,
    text,
    thinking,
    tool_call,
)


@verifies(SWR.SWR_1285)
def test_script_structure_honored() -> None:
    llm = LoremLLM(
        script=[
            [thinking(words=30), tool_call("bash", args={"command": "ls"}), text(words=50)],
            [text(words=20)],
        ],
        seed=5,
    )
    r1 = llm.completion([])
    assert r1.message.reasoning_content
    assert r1.message.tool_calls is not None
    assert r1.message.tool_calls[0].name == "bash"
    assert '"command"' in r1.message.tool_calls[0].arguments
    body = "".join(c.text for c in r1.message.content)
    assert len(body.split()) >= 30

    r2 = llm.completion([])
    assert r2.message.tool_calls is None
    assert r2.message.reasoning_content is None


@verifies(SWR.SWR_1285)
def test_script_exhaustion_raises() -> None:
    llm = LoremLLM(script=[[text(words=5)]], seed=1)
    llm.completion([])
    with pytest.raises(LoremScriptExhaustedError):
        llm.completion([])


@verifies(SWR.SWR_1285)
def test_calls_are_recorded() -> None:
    llm = LoremLLM(script=[[text()], [text()]], seed=1)
    llm.completion(["msg-a"])
    llm.completion(["msg-b"])
    assert llm.calls == [["msg-a"], ["msg-b"]]


@verifies(SWR.SWR_1285)
def test_same_seed_and_script_deterministic() -> None:
    def build() -> str:
        llm = LoremLLM(script=[[text(words=80)]], seed=11)
        r = llm.completion([])
        return "".join(c.text for c in r.message.content)

    assert build() == build()


@verifies(SWR.SWR_1285)
def test_tool_call_without_args_gets_lorem_args() -> None:
    llm = LoremLLM(script=[[tool_call("grep")]], seed=2)
    r = llm.completion([])
    assert r.message.tool_calls[0].arguments.startswith("{")


@verifies(SWR.SWR_1285)
def test_invalid_part_rejected_at_construction() -> None:
    with pytest.raises(TypeError):
        LoremLLM(script=[["not a part"]], seed=1)  # type: ignore[list-item]


@verifies(SWR.SWR_1285)
def test_next_turn_text_returns_plain_string() -> None:
    llm = LoremLLM(script=[[thinking(), text(words=40)]], seed=3)
    out = llm.next_turn_text()
    assert isinstance(out, str)
    assert len(out.split()) >= 25


@verifies(SWR.SWR_1285)
def test_presets_are_infinite_and_deterministic() -> None:
    a = LoremLLM.chatty(seed=4)
    b = LoremLLM.chatty(seed=4)
    for _ in range(5):
        ta = "".join(c.text for c in a.completion([]).message.content)
        tb = "".join(c.text for c in b.completion([]).message.content)
        assert ta == tb


@verifies(SWR.SWR_1285)
def test_tool_heavy_preset_emits_tool_calls() -> None:
    llm = LoremLLM.tool_heavy(seed=6)
    seen_tool = any(llm.completion([]).message.tool_calls for _ in range(5))
    assert seen_tool


@verifies(SWR.SWR_1285)
def test_terse_preset_short_text() -> None:
    llm = LoremLLM.terse(seed=8)
    body = "".join(c.text for c in llm.completion([]).message.content)
    assert len(body.split()) < 60


@verifies(SWR.SWR_1285)
def test_mixed_preset_varies_turn_length() -> None:
    llm = LoremLLM.mixed(seed=10)
    lengths = set()
    for _ in range(8):
        msg = llm.completion([]).message
        lengths.add(sum(len(c.text.split()) for c in msg.content))
    assert len(lengths) > 3
