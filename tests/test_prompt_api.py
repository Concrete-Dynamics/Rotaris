from __future__ import annotations

import unittest

from rotaris_core.api.prompts import PromptSubmissionAPI
from rotaris_core.core.prompt_types import PromptRegistry
from rotaris_core.reqtocode import SWR, verifies


@verifies(SWR.SWR_1005)
class TestPromptSubmissionAPI(unittest.TestCase):
    def setUp(self) -> None:
        self.api = PromptSubmissionAPI()
        # The registry behind this API is a process-wide singleton, so the prompts
        # submitted below outlive the test that submits them. What keeps that from
        # reaching the next test is `tests/conftest.py::_isolate_prompt_registry`,
        # which empties it around every test through `PromptRegistry.clear()`.

    @verifies(SWR.SWR_1005)
    def test_submit_steering_success(self) -> None:
        child_id = "test_child_123"
        content = "Please be more concise."
        prompt_id = self.api.submit_steering(child_id, content)

        self.assertIsInstance(prompt_id, str)
        self.assertTrue(len(prompt_id) > 0)

        # Verify it's in the registry
        registry = PromptRegistry()
        prompts = registry.get_steering_prompts(child_id)
        self.assertTrue(any(p.id == prompt_id and p.content == content for p in prompts))

    @verifies(SWR.SWR_1005)
    def test_submit_steering_empty_content(self) -> None:
        with self.assertRaises(ValueError):
            self.api.submit_steering("child_id", "")
        with self.assertRaises(ValueError):
            self.api.submit_steering("child_id", "   ")

    @verifies(SWR.SWR_1005)
    def test_submit_steering_empty_child_id(self) -> None:
        with self.assertRaises(ValueError):
            self.api.submit_steering("", "content")
        with self.assertRaises(ValueError):
            self.api.submit_steering("  ", "content")

    @verifies(SWR.SWR_1005)
    def test_submit_queued_success(self) -> None:
        content = "Verify the previous output."
        context = {"session_id": "abc-123"}
        prompt_id = self.api.submit_queued(content, context)

        self.assertIsInstance(prompt_id, str)
        self.assertTrue(len(prompt_id) > 0)

        # Verify it's in the registry
        registry = PromptRegistry()
        prompts = registry.get_queued_prompts()
        self.assertTrue(
            any(
                p.id == prompt_id and p.content == content and p.context_snapshot == context
                for p in prompts
            ),
        )

    @verifies(SWR.SWR_1005)
    def test_submit_queued_no_context(self) -> None:
        content = "Just a prompt."
        prompt_id = self.api.submit_queued(content)

        registry = PromptRegistry()
        prompts = registry.get_queued_prompts()
        self.assertTrue(
            any(
                p.id == prompt_id and p.content == content and p.context_snapshot == {}
                for p in prompts
            ),
        )

    @verifies(SWR.SWR_1005)
    def test_submit_queued_empty_content(self) -> None:
        with self.assertRaises(ValueError):
            self.api.submit_queued("")
        with self.assertRaises(ValueError):
            self.api.submit_queued("   ")

    @verifies(SWR.SWR_1005)
    def test_update_and_list_queued(self) -> None:
        prompt_id = self.api.submit_queued("draft")

        self.api.update_queued(prompt_id, "revised")

        prompt = next(item for item in self.api.list_queued() if item.id == prompt_id)
        self.assertEqual(prompt.content, "revised")

    @verifies(SWR.SWR_1005)
    def test_update_queued_rejects_empty_content(self) -> None:
        with self.assertRaises(ValueError):
            self.api.update_queued("prompt-id", "  ")


if __name__ == "__main__":
    unittest.main()
