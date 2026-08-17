import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.llm.errors import LLMError
from app.pipelines.summarize import (
    SUMMARY_KEYS,
    normalize_summary,
    summarize_publication_result,
)


class SummaryContractTest(unittest.TestCase):
    def test_normalize_summary_fills_missing_fields(self):
        summary = normalize_summary({"tldr": "Short takeaway.", "topics": ["RAG", "search"]})

        self.assertEqual(summary["tldr"], "Short takeaway.")
        self.assertEqual(summary["topics"], "RAG; search")
        self.assertEqual(summary["contributions"], "Not specified in the abstract.")
        self.assertEqual(summary["applications"], "Not specified in the abstract.")

    def test_summarize_publication_result_includes_metadata(self):
        fake_response = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content=(
                            '{"tldr":"A clear summary.",'
                            '"problem":"The problem.",'
                            '"method":"The method.",'
                            '"results":"The results.",'
                            '"contributions":"The contribution.",'
                            '"limitations":"Not specified in the abstract.",'
                            '"takeaways":"The takeaway.",'
                            '"applications":"The application.",'
                            '"topics":"semantic search",'
                            '"industry":"Industry framing.",'
                            '"impact":"Impact framing."}'
                        )
                    )
                )
            ]
        )

        with (
            patch("app.pipelines.summarize.resolve_model", return_value="gemini/test"),
            patch("app.pipelines.summarize.complete_response", return_value=fake_response),
        ):
            result = summarize_publication_result(
                {
                    "title": "Semantic Search",
                    "venue": "ExampleConf",
                    "year": 2026,
                    "abstract": "We study semantic search.",
                }
            )

        self.assertEqual(result["aiSummary"]["contributions"], "The contribution.")
        self.assertEqual(result["aiSummary"]["topics"], "semantic search")
        self.assertEqual(result["aiSummaryModel"], "gemini/test")
        # The LLM path now refines the extractive draft, so it carries the refine
        # prompt's version. The extractive-only fallback stamps "extractive" instead.
        self.assertEqual(result["aiSummaryPromptVersion"], "summary-refine-v1")
        self.assertIn("aiSummaryGeneratedAt", result)

    def test_falls_back_to_extractive_when_llm_unavailable(self):
        # No provider configured → resolve_model raises → we must still return a
        # full extractive summary, never propagate the error. This is the whole
        # point of the hybrid: summaries never hard-depend on a paid/quota model.
        #
        # Raises the error the real code raises. This used to stand in a plain
        # RuntimeError, which no path here can actually produce — so it passed
        # against a bare `except Exception` and would have kept passing if the
        # fallback caught everything, including this repository's own bugs.
        pub = {
            "title": "Deep learning for ECG diagnosis",
            "venue": "ExampleConf",
            "year": 2026,
            "abstract": "We propose a model. Our results show 92% accuracy.",
        }
        not_configured = LLMError("LLM_NOT_CONFIGURED", "No language model provider is configured.")
        with patch("app.pipelines.summarize.resolve_model", side_effect=not_configured):
            result = summarize_publication_result(pub)

        self.assertEqual(result["aiSummaryModel"], "extractive")
        self.assertEqual(result["aiSummaryPromptVersion"], "extractive-v1")
        self.assertTrue(result["aiSummary"]["tldr"])
        self.assertEqual(set(result["aiSummary"].keys()), set(SUMMARY_KEYS))

    def test_refine_false_skips_the_llm_entirely(self):
        # extractive-only mode must not touch the LLM even when one is configured.
        with patch("app.pipelines.summarize.complete_response", side_effect=AssertionError("LLM called")):
            result = summarize_publication_result(
                {"title": "X", "abstract": "We present a method. Results are strong."},
                refine=False,
            )
        self.assertEqual(result["aiSummaryModel"], "extractive")


if __name__ == "__main__":
    unittest.main()
