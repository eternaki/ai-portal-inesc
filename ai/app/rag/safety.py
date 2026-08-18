import re


# Screened in two directions, because the text reaching a prompt comes from two
# places: retrieved content (an OpenAlex abstract someone poisoned) and the
# visitor's own message. Only the first was ever checked, which left the obvious
# route open — typing it into the chat box.
#
# Portuguese as well as English: the site is bilingual, so a filter that only
# reads English is a filter with a documented way around it.
INJECTION_PATTERNS = (
    r"ignore (all )?(previous|above|prior) instructions",
    r"disregard (all )?(previous|above|prior) instructions",
    r"forget (all )?(previous|above|your) instructions",
    r"system prompt",
    r"developer message",
    r"you are now",
    r"act as",
    r"pretend (to be|you are)",
    r"esquec[ea] (as |todas as )?instruç(ões|oes)",
    r"ignor[ea] (as |todas as )?instruç(ões|oes)",
    r"a partir de agora (tu |você )?és",
    r"finge (que |ser )",
)


def sanitize_text(value: object, *, max_chars: int = 2000) -> str:
    text = _plain_text(value)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_chars]


def detect_prompt_injection(value: str) -> bool:
    lowered = value.lower()
    return any(re.search(pattern, lowered) for pattern in INJECTION_PATTERNS)


def _plain_text(value: object) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, list):
        return " ".join(_plain_text(item) for item in value)
    if isinstance(value, dict):
        parts: list[str] = []
        if isinstance(value.get("text"), str):
            parts.append(value["text"])
        for child in value.get("children") or []:
            parts.append(_plain_text(child))
        if not parts:
            for item in value.values():
                parts.append(_plain_text(item))
        return " ".join(parts)
    return str(value)
