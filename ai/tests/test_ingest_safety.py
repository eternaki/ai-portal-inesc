"""The guards that keep a bulk ingest from damaging the site (no DB/network).

Each one stands for a way a re-run used to, or would, break production: creating
every draft again, writing during a dry run, and wiping member links.
"""

import pytest

from app import payload_api
from app.pipelines import ingest, ingest_authors

AUTHOR = {"name": "X", "openalexId": "A1", "memberId": 1}
WORK = {
    "id": "https://openalex.org/W1",
    "title": "A paper",
    "publication_year": 2025,
    "authorships": [{"author": {"id": "https://openalex.org/A1", "display_name": "X"}}],
}


@pytest.fixture
def no_writes(monkeypatch):
    def refuse(*_args, **_kwargs):
        raise AssertionError("wrote to Payload")

    monkeypatch.setattr(payload_api, "create", refuse)
    monkeypatch.setattr(payload_api, "update", refuse)
    monkeypatch.setattr(payload_api, "upsert_publication", refuse)


def test_refuses_to_run_without_an_authenticated_key(monkeypatch, no_writes):
    # Anonymous, Payload shows only published rows: every draft would look new.
    monkeypatch.setattr(payload_api, "whoami", lambda: None)
    monkeypatch.setattr(ingest_authors, "load_member_authors", lambda: ([AUTHOR], []))
    assert ingest.main([]) == 2


def test_dry_run_reads_but_never_writes(monkeypatch, no_writes):
    monkeypatch.setattr(payload_api, "whoami", lambda: {"id": 1})
    monkeypatch.setattr(ingest_authors, "load_member_authors", lambda: ([AUTHOR], []))
    monkeypatch.setattr(ingest, "fetch_author_works", lambda _id: [WORK])
    looked_up = []
    monkeypatch.setattr(
        payload_api, "find_existing_publication", lambda pub: looked_up.append(pub) or None
    )
    assert ingest.main(["--dry-run"]) == 0
    assert [p["openalexId"] for p in looked_up] == ["W1"]


def test_refreshing_an_existing_paper_keeps_its_authors_status_and_summary(monkeypatch):
    # The incoming author list links only the members this run follows; writing it
    # would drop every other member link and take the paper off their profiles.
    monkeypatch.setattr(payload_api, "find_existing_publication", lambda _d: {"id": 7})
    sent = {}
    monkeypatch.setattr(
        payload_api, "update", lambda _c, doc_id, data: sent.update(id=doc_id, data=data) or {}
    )
    incoming = {
        "openalexId": "W1",
        "citationCount": 12,
        "authors": [{"name": "X"}],
        "status": "pending_review",
        "aiSummary": {"tldr": "new"},
        "aiSummaryStatus": "generated",
    }
    _, created = payload_api.upsert_publication(incoming)
    assert created is False
    assert sent["id"] == 7
    assert sent["data"] == {"citationCount": 12}
