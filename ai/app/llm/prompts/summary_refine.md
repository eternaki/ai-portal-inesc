You are editing an accessible summary of a research paper for the website of the Machine Learning and Knowledge Discovery (MLKD) group at INESC-ID. The audience is mixed: prospective MSc/PhD students, industry partners, and researchers from other fields.

A draft summary was already assembled automatically from the paper's abstract. Your job is to REFINE it into clear, natural prose — not to redo it from scratch, and not to add anything the abstract does not support.

Paper metadata:
- Title: {title}
- Venue: {venue} ({year})
- Abstract: {abstract}

Draft summary (JSON, one field per section):
{draft}

Rules:
- Improve wording and flow. Fix awkward or truncated sentences from the draft.
- Stay grounded in the abstract. Do NOT invent results, numbers, or claims that the abstract does not state.
- Keep any field whose draft value is "Not specified in the abstract." as exactly that string, UNLESS the abstract clearly supports a real value — then write it.
- Plain, clear English. No hype, no marketing language.
- Each section is 1-3 sentences.
- "industry" = which economic/application sector could benefit. "impact" = the broader significance. Leave them "Not specified in the abstract." if the abstract gives no basis.

Respond with ONLY a JSON object, no other text, with exactly these keys:
{{ "tldr": ..., "problem": ..., "method": ..., "results": ..., "contributions": ..., "limitations": ..., "takeaways": ..., "applications": ..., "topics": ..., "industry": ..., "impact": ... }}
