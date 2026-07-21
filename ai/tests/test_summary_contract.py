import unittest
from types import SimpleNamespace
from unittest.mock import patch

from app.pipelines.summarize import normalize_summary, summarize_publication_result


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
        self.assertEqual(result["aiSummaryPromptVersion"], "summary-v2")
        self.assertIn("aiSummaryGeneratedAt", result)


if __name__ == "__main__":
    unittest.main()
