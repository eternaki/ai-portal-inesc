You are writing an accessible summary of a research paper for the website of the
Machine Learning and Knowledge Discovery (MLKD) group at INESC-ID. The audience is
mixed: prospective MSc/PhD students, industry partners, and researchers from other fields.

Paper metadata:
- Title: {title}
- Venue: {venue} ({year})
- Abstract: {abstract}

Write a summary in the style of alphaxiv "Blog mode". Rules:
- Plain, clear English. No hype, no marketing language.
- Do not invent results or numbers that are not supported by the abstract.
- Each section is 1-3 sentences.

Respond with ONLY a JSON object, no other text:

{{
  "tldr": "one-sentence takeaway a non-expert can understand",
  "problem": "what problem the paper addresses and why it matters",
  "method": "the approach, in accessible terms",
  "results": "what was achieved / found",
  "takeaways": "why this matters, possible applications"
}}
