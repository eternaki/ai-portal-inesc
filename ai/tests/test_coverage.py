"""Unit tests for the coverage metrics (pure, no DB/network needed)."""

from app.pipelines.coverage import member_gap, summarize


def test_discovered_is_on_site_minus_baseline():
    # The report's headline case: "had 10, the site shows 13" -> +3 discovered.
    gap = member_gap(13, 10)
    assert gap["on_site"] == 13
    assert gap["baseline"] == 10
    assert gap["discovered"] == 3


def test_unknown_baseline_never_counts_as_zero():
    # A missing baseline must not fake a discovery of the full corpus.
    gap = member_gap(13, None)
    assert gap["baseline"] is None
    assert gap["discovered"] is None


def test_discovered_can_be_negative_when_site_lags_behind():
    # Fewer papers on the site than were already known is a coverage problem —
    # surface it rather than clamping to zero.
    assert member_gap(8, 10)["discovered"] == -2


def test_openalex_gap_is_reported_only_when_checked():
    assert member_gap(13, 10)["missing_vs_openalex"] is None
    assert member_gap(13, 10, 20)["missing_vs_openalex"] == 7
    assert member_gap(13, 10, 20)["openalex_total"] == 20


def test_summarize_totals_only_over_members_with_a_baseline():
    members = [
        {**member_gap(13, 10), "id": 1},   # +3
        {**member_gap(5, 4), "id": 2},     # +1
        {**member_gap(7, None), "id": 3},  # no baseline -> excluded from baseline totals
    ]
    s = summarize(members)
    assert s["members_total"] == 3
    assert s["members_with_baseline"] == 2
    assert s["totals"]["on_site"] == 25            # every member counts here
    assert s["totals"]["on_site_with_baseline"] == 18
    assert s["totals"]["baseline"] == 14
    assert s["totals"]["discovered"] == 4          # 3 + 1, the no-baseline row ignored
    assert s["members_without_links"] == 0


def test_summarize_counts_members_with_no_linked_publications():
    members = [{**member_gap(0, None), "id": 1}, {**member_gap(2, 1), "id": 2}]
    s = summarize(members)
    assert s["members_without_links"] == 1
    assert s["totals"]["discovered"] == 1


def test_summarize_handles_empty_input():
    s = summarize([])
    assert s["members_total"] == 0
    assert s["totals"]["discovered"] == 0
