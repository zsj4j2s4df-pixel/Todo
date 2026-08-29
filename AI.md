# AI Architecture

Primary provider: OpenAI.
Optional provider: Claude.

Use a server-side AI Gateway with provider adapters.

Deterministic parsing handles straightforward dates/times. AI handles natural language and ambiguity.

External text is untrusted and must never become system instructions or authorization.

AI output is schema-validated and authorized before any action.
