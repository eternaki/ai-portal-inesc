"""Prompts are files reviewed like code — so their interface gets checked like code.

`load_prompt` is `str.format`, which means a placeholder the caller does not pass
is a KeyError at the moment of the call. Nothing here catches that: the prompt
files are data, the call sites are pages away, and with no provider configured
the failing line is never reached in development at all. Add a variable to a
prompt, ship it, and the feature breaks for whoever first configures a key.

So this reads both sides — the `{fields}` in each .md, and the keywords each
`load_prompt(...)` call actually passes, via the AST rather than a regex — and
requires them to agree.
"""

import ast
from pathlib import Path
from string import Formatter

import pytest

APP = Path(__file__).resolve().parent.parent / "app"
PROMPTS = APP / "llm" / "prompts"


def prompt_fields(path: Path) -> set[str]:
    """The {names} a template needs. `{{` / `}}` are literal braces, not fields."""
    text = path.read_text(encoding="utf-8")
    return {name for _, name, _, _ in Formatter().parse(text) if name}


def call_sites() -> dict[str, list[tuple[str, set[str]]]]:
    """Every load_prompt("name", **kwargs) in the service → {prompt: [(where, keys)]}."""
    found: dict[str, list[tuple[str, set[str]]]] = {}
    for source in APP.rglob("*.py"):
        tree = ast.parse(source.read_text(encoding="utf-8"), filename=str(source))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            name = getattr(node.func, "id", None) or getattr(node.func, "attr", None)
            if name != "load_prompt" or not node.args:
                continue
            target = node.args[0]
            if not isinstance(target, ast.Constant) or not isinstance(target.value, str):
                continue  # computed prompt name — nothing static to check
            where = f"{source.relative_to(APP.parent)}:{node.lineno}"
            keys = {kw.arg for kw in node.keywords if kw.arg}
            found.setdefault(target.value, []).append((where, keys))
    return found


CALLS = call_sites()
PROMPT_FILES = sorted(PROMPTS.glob("*.md"))


def test_the_scanner_found_the_call_sites():
    # Guards the guard: if load_prompt were renamed, every assertion below would
    # pass over an empty set and prove nothing.
    assert CALLS, "no load_prompt(...) calls found — the AST scan is looking for the wrong name"
    assert PROMPT_FILES, "no prompt templates found"


@pytest.mark.parametrize("path", PROMPT_FILES, ids=lambda p: p.name)
def test_every_prompt_is_filled_by_its_callers(path):
    name = path.stem
    sites = CALLS.get(name)
    if not sites:
        pytest.skip(f"{name}.md has no static call site")

    needed = prompt_fields(path)
    for where, passed in sites:
        missing = needed - passed
        assert not missing, f"{where} does not pass {sorted(missing)} required by {name}.md"
        unused = passed - needed
        assert not unused, f"{where} passes {sorted(unused)}, which {name}.md never uses"


@pytest.mark.parametrize("path", PROMPT_FILES, ids=lambda p: p.name)
def test_every_prompt_renders(path):
    # Catches a stray unescaped brace: prose with a bare { is a format field, and
    # would raise for every caller regardless of what they pass.
    filled = path.read_text(encoding="utf-8").format(**{field: "x" for field in prompt_fields(path)})
    assert filled.strip()


@pytest.mark.parametrize("path", PROMPT_FILES, ids=lambda p: p.name)
def test_a_json_prompt_shows_a_json_example(path):
    # Every prompt whose caller parses JSON must show the shape it wants; the
    # example braces have to be escaped or .format eats them.
    text = path.read_text(encoding="utf-8")
    if "JSON" not in text:
        pytest.skip("not a JSON prompt")
    assert "{{" in text and "}}" in text, f"{path.name} asks for JSON but shows no escaped example"


def test_no_orphaned_prompt_files():
    # A prompt nobody loads is either dead or a feature wired up wrong; both are
    # worth knowing about, and neither is visible from the file alone.
    orphans = sorted(path.name for path in PROMPT_FILES if path.stem not in CALLS)
    assert not orphans, f"prompt templates nothing loads: {orphans}"


def test_no_call_site_names_a_missing_prompt():
    available = {path.stem for path in PROMPT_FILES}
    for name, sites in CALLS.items():
        assert name in available, f"{sites[0][0]} loads {name!r}, which has no .md"
