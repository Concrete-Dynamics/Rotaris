from rotaris_core.reqtocode import SWR, verifies
from rotaris_core.testing.lorem import LoremMarkdownGenerator, MarkdownProfile


@verifies(SWR.SWR_1285)
def test_same_seed_produces_identical_output() -> None:
    a = LoremMarkdownGenerator(seed=42).markdown(words=300)
    b = LoremMarkdownGenerator(seed=42).markdown(words=300)
    assert a == b


@verifies(SWR.SWR_1285)
def test_different_seeds_produce_different_output() -> None:
    a = LoremMarkdownGenerator(seed=1).markdown(words=300)
    b = LoremMarkdownGenerator(seed=2).markdown(words=300)
    assert a != b


@verifies(SWR.SWR_1285)
def test_words_returns_exact_count() -> None:
    out = LoremMarkdownGenerator(seed=7).words(25)
    assert len(out.split()) == 25


@verifies(SWR.SWR_1285)
def test_sentence_capitalized_and_terminated() -> None:
    s = LoremMarkdownGenerator(seed=7).sentence()
    assert s[0].isupper()
    assert s.endswith(".")


@verifies(SWR.SWR_1285)
def test_paragraph_sentence_count() -> None:
    p = LoremMarkdownGenerator(seed=7).paragraph(sentences=4)
    assert p.count(".") >= 4


@verifies(SWR.SWR_1285)
def test_markdown_word_budget_within_tolerance() -> None:
    out = LoremMarkdownGenerator(seed=9).markdown(words=400)
    count = len(out.split())
    assert 300 <= count <= 520


@verifies(SWR.SWR_1285)
def test_markdown_contains_expected_elements() -> None:
    out = LoremMarkdownGenerator(seed=3).markdown(words=1200)
    assert "# " in out or "## " in out
    assert "```" in out
    assert "- " in out
    assert "**" in out
    assert "`" in out


@verifies(SWR.SWR_1285)
def test_profile_can_disable_blocks() -> None:
    plain = MarkdownProfile(
        heading=0.0,
        code_block=0.0,
        bullet_list=0.0,
        numbered_list=0.0,
        inline_code=0.0,
        bold=0.0,
        italic=0.0,
        link=0.0,
    )
    out = LoremMarkdownGenerator(seed=3, profile=plain).markdown(words=600)
    assert "```" not in out
    assert "**" not in out
    assert "# " not in out
