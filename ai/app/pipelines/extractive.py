"""Deterministic, LLM-free publication summaries.

Builds the same 11-field structure the LLM summarizer produces, purely from the
metadata OpenAlex already gives us (title, venue, year, type, abstract). It is the
baseline layer of the hybrid summarizer: this draft is always available — no API
key, no quota, no network — so summaries never depend on a paid or rate-limited
model. When an LLM is configured it only refines the wording; with none, this
stands on its own.

Heuristic, not magic: it splits the abstract into sentences and routes each to a
section by simple lexical cues, then fills anything it can't find with the same
"Not specified in the abstract." sentinel the LLM path uses. It never invents
facts — a field it can't ground stays unspecified.
"""

import re

_NOT_SPECIFIED = "Not specified in the abstract."

# Provenance stamped on a summary that never went through an LLM, so the admin and
# the traceability metadata can tell an extractive draft from a model-refined one.
EXTRACTIVE_MODEL = "extractive"
EXTRACTIVE_VERSION = "extractive-v1"

SUMMARY_KEYS = (
    "tldr", "problem", "method", "results", "contributions",
    "limitations", "takeaways", "applications", "topics", "industry", "impact",
)

# Lexical cues that hint which section a sentence belongs to. A sentence can feed
# more than one section (e.g. a results sentence often also states a method), so
# each bucket scans the whole abstract independently and takes the best match.
_CUES: dict[str, tuple[str, ...]] = {
    "problem": ("however", "challenge", "problem", "difficult", "limitation of",
                "remains", "lack of", "hard to", "bottleneck", "struggle"),
    "method": ("we propose", "we present", "we introduce", "this paper", "we develop",
               "we design", "our approach", "our method", "we use", "based on",
               "framework", "we train", "architecture"),
    "results": ("results", "we show", "achieve", "outperform", "state-of-the-art",
                "state of the art", "improve", "accuracy", "performance",
                "demonstrate", "experiments show", "evaluate", "reduces", "gains"),
    "contributions": ("we contribute", "our contribution", "contributions",
                      "we provide", "novel", "first to", "we release"),
    "limitations": ("limitation", "future work", "does not", "cannot", "fails to",
                    "left for future", "not able", "remains an open"),
    "applications": ("applied to", "application", "can be used", "useful for",
                     "in practice", "real-world", "real world", "deployed",
                     "clinical", "industrial"),
}

# Rough domain → beneficiary map for the two brief-mandated fields, so `industry`
# and `impact` aren't always blank without an LLM. Only fires on a clear keyword.
_INDUSTRY_HINTS = (
    ("health", "healthcare and clinical decision support"),
    ("clinical", "healthcare and clinical decision support"),
    ("medical", "healthcare and medical imaging"),
    ("ecg", "healthcare and cardiology"),
    ("protein", "biotechnology and drug discovery"),
    ("genomic", "biotechnology and genomics"),
    ("bioinformatic", "biotechnology and bioinformatics"),
    ("retrieval", "search and information retrieval"),
    ("language model", "language technology and NLP tooling"),
    ("recommend", "recommendation and personalization"),
    ("finance", "finance and risk analysis"),
    ("security", "security and fraud detection"),
)


# Labelled sections in a structured abstract (common in medical/bio venues), and
# which of our fields each maps to. Parsing these directly beats cue-guessing.
_SECTION_LABELS = (
    (("background", "introduction", "context"), "problem"),
    (("objective", "objectives", "aim", "aims", "purpose", "goal"), "tldr"),
    (("method", "methods", "materials and methods", "approach", "design"), "method"),
    (("result", "results", "findings"), "results"),
    (("conclusion", "conclusions", "discussion", "significance", "interpretation"), "takeaways"),
)


def _sentences(text: str) -> list[str]:
    text = re.sub(r"\s+", " ", (text or "").strip())
    if not text:
        return []
    # Split on sentence end followed by a capital/number; keep it simple and safe.
    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9])", text)
    return [p.strip() for p in parts if len(p.strip()) > 20]


def _structured_sections(abstract: str) -> dict[str, str]:
    """Parse an 'INTRODUCTION: … METHODS: … RESULTS: …' abstract into our fields.

    Returns {} unless at least two labelled sections are found, so a normal prose
    abstract falls through to the cue-based path untouched.
    """
    # Split on ALLCAPS or Titlecase labels followed by a colon.
    matches = list(re.finditer(r"\b([A-Z][A-Za-z ]{2,30}?)\s*:\s+", abstract))
    if len(matches) < 2:
        return {}
    out: dict[str, str] = {}
    for i, m in enumerate(matches):
        label = m.group(1).strip().lower()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(abstract)
        body = abstract[m.end():end].strip()
        if not body:
            continue
        for names, field in _SECTION_LABELS:
            if any(label == n or label.startswith(n) for n in names) and field not in out:
                out[field] = body
                break
    return out


def _first_match(sentences: list[str], cues: tuple[str, ...], used: set[str]) -> str | None:
    """First unused sentence matching any cue — `used` prevents one sentence from
    filling several sections (which made tldr/problem/results read identically)."""
    for s in sentences:
        if s in used:
            continue
        low = s.lower()
        if any(cue in low for cue in cues):
            used.add(s)
            return s
    return None


def _topics(pub: dict, sentences: list[str]) -> str:
    """A best-effort topic line from venue + salient title words. Never an LLM."""
    bits: list[str] = []
    venue = (pub.get("venue") or "").strip()
    if venue and venue.lower() != "unknown venue":
        bits.append(venue)
    title = (pub.get("title") or "").strip()
    # Multi-word Capitalized phrases in the title read as topic keywords.
    phrases = re.findall(r"\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)\b", title)
    for p in phrases[:2]:
        if p not in bits:
            bits.append(p)
    return "; ".join(bits) if bits else _NOT_SPECIFIED


def _industry_impact(pub: dict) -> tuple[str, str]:
    haystack = f"{pub.get('title') or ''} {pub.get('abstract') or ''}".lower()
    for key, label in _INDUSTRY_HINTS:
        if key in haystack:
            return (
                f"Potentially relevant to {label}.",
                f"Advances methods that could benefit {label}.",
            )
    return _NOT_SPECIFIED, _NOT_SPECIFIED


def extractive_summary(pub: dict) -> dict[str, str]:
    """Assemble the 11-field summary from metadata alone. Always returns all keys."""
    abstract = (pub.get("abstract") or "").strip()
    sects = _structured_sections(abstract)
    sents = _sentences(abstract)
    used: set[str] = set()  # a sentence, once assigned, doesn't fill another section

    # tldr: a labelled objective if present; else the opening 1-2 sentences; else title.
    if sects.get("tldr"):
        tldr = sects["tldr"]
    elif sents:
        tldr = " ".join(sents[:2]) if len(sents[0]) < 120 and len(sents) > 1 else sents[0]
        used.add(sents[0])
    else:
        title = (pub.get("title") or "").strip()
        venue = (pub.get("venue") or "").strip()
        year = pub.get("year")
        tldr = " ".join(
            p for p in [title, f"Published in {venue}" if venue else "", f"({year})" if year else ""] if p
        ).strip() or _NOT_SPECIFIED

    # Structured section wins; otherwise route by lexical cue (dedup via `used`).
    problem = sects.get("problem") or _first_match(sents, _CUES["problem"], used)
    method = sects.get("method") or _first_match(sents, _CUES["method"], used)
    results = sects.get("results") or _first_match(sents, _CUES["results"], used)
    contributions = _first_match(sents, _CUES["contributions"], used)
    limitations = _first_match(sents, _CUES["limitations"], used)
    applications = _first_match(sents, _CUES["applications"], used)

    # takeaways: a labelled conclusion, else the closing sentence, else the tldr.
    takeaways = sects.get("takeaways") or (sents[-1] if sents else tldr)
    industry, impact = _industry_impact(pub)

    fields = {
        "tldr": tldr,
        "problem": problem,
        "method": method,
        "results": results,
        "contributions": contributions,
        "limitations": limitations,
        "takeaways": takeaways,
        "applications": applications,
        "topics": _topics(pub, sents),
        "industry": industry,
        "impact": impact,
    }
    return {k: (v.strip() if isinstance(v, str) and v.strip() else _NOT_SPECIFIED) for k, v in fields.items()}
