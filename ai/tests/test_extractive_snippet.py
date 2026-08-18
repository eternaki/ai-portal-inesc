"""The LLM-free social post: assembled from the record, never about it."""

from app.pipelines.extractive_snippet import X_LIMIT, extractive_snippet

PAPER = {
    "title": "Deep learning for chest X-ray triage",
    "venue": "MICCAI",
    "year": 2024,
    "abstract": "We propose a convolutional model. It reaches 92% accuracy on a held-out set.",
    "originalUrl": "https://example.org/paper",
}


def test_a_paper_post_names_the_work_the_venue_and_the_year():
    post = extractive_snippet("research paper", PAPER)["linkedin"]
    assert "Deep learning for chest X-ray triage" in post
    assert "in MICCAI" in post and "(2024)" in post
    assert "https://example.org/paper" in post


def test_it_quotes_the_abstract_rather_than_characterising_it():
    # It has no way to judge significance, so it must not claim any: the opening
    # sentence of the abstract is a fact, "an exciting breakthrough" is not.
    post = extractive_snippet("research paper", PAPER)["linkedin"]
    assert "We propose a convolutional model." in post
    for editorial in ("exciting", "breakthrough", "thrilled", "proud", "groundbreaking"):
        assert editorial not in post.lower()


def test_a_missing_venue_or_year_leaves_no_wreckage():
    # The failure this guards is cosmetic and very visible: a post that goes out
    # reading "... : Title in  ()." because two fields were empty.
    post = extractive_snippet("research paper", {"title": "Untitled work"})["linkedin"]
    assert "()" not in post
    assert " in ." not in post
    assert post.startswith("New publication from the MLKD @ INESC-ID group: Untitled work.")


def test_only_the_year_is_known():
    post = extractive_snippet("research paper", {"title": "T", "year": 2020})["linkedin"]
    assert "T (2020)." in post
    assert "in (" not in post


def test_the_x_post_fits_the_platform():
    long_title = " ".join(["extremely"] * 60)
    post = extractive_snippet("research paper", {"title": long_title})["x"]
    assert len(post) <= X_LIMIT + 1
    assert post.endswith("…")


def test_a_news_item_reads_as_news_not_as_a_paper():
    post = extractive_snippet("news item", {"title": "The group welcomes two students"})["linkedin"]
    assert post.startswith("News from the MLKD @ INESC-ID group:")
    assert "publication" not in post.lower()


def test_both_channels_are_always_present():
    for doc in (PAPER, {"title": "T"}, {}):
        snippet = extractive_snippet("research paper", doc)
        assert set(snippet) == {"linkedin", "x"}
        assert isinstance(snippet["linkedin"], str) and isinstance(snippet["x"], str)


def test_whitespace_in_the_source_does_not_reach_the_post():
    doc = {"title": "  A   spaced\n\ntitle ", "year": 2021}
    assert "A spaced title" in extractive_snippet("research paper", doc)["linkedin"]


# --- defects found by reading a real post, not a fixture -------------------


def test_a_bare_doi_is_turned_into_something_clickable():
    # `doi` is stored bare. Pasted into a post it is not a link, so the reader
    # has nowhere to go — it has to be resolved through doi.org.
    post = extractive_snippet("research paper", {"title": "T", "doi": "10.48550/arxiv.2603.00181"})
    assert "https://doi.org/10.48550/arxiv.2603.00181" in post["linkedin"]


def test_an_open_access_url_is_preferred_over_the_doi():
    # Same reason the site prefers it: doi.org usually lands on a paywall.
    doc = {"title": "T", "doi": "10.1/x", "originalUrl": "https://example.org/pdf"}
    assert "https://example.org/pdf" in extractive_snippet("research paper", doc)["linkedin"]
    assert "doi.org" not in extractive_snippet("research paper", doc)["linkedin"]


def test_no_double_space_creeps_in_before_the_link():
    post = extractive_snippet("research paper", PAPER)["linkedin"]
    assert "  " not in post


def test_the_quoted_sentence_keeps_its_full_stop_and_nothing_more():
    body = extractive_snippet("research paper", PAPER)["linkedin"]
    assert "We propose a convolutional model. It reaches" not in body  # one sentence only
    assert "We propose a convolutional model." in body
