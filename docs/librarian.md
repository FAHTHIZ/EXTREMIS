# Librarian architecture

## Purpose

The Librarian is a small, host-neutral selector that finds relevant EXTREMIS skills and proposes a compact set for a task. It is deliberately separate from the agent that executes the work.

It does not launch agents, call APIs, grant permissions, browse the web, or perform task actions. The host remains responsible for execution, approvals, tool access, and verification.

## Current retrieval pipeline

1. **Load catalogue:** read `registry/skills-index.json` and each indexed `SKILL.md`. Reject paths that resolve outside the repository root.
2. **Build searchable fields:** keep skill name, summary, curated alternate keywords, description, category, prerequisites, negative scope boundaries, and the complete instruction body separate.
3. **Tokenize:** lowercase terms, discard a small stop-word list, and use the Python standard library only.
4. **Rank:** calculate field-weighted BM25. Skill name and summary receive the strongest weights; full skill text remains searchable so procedural requirements can distinguish skills with similar descriptions.
5. **Explain:** return matched terms, fields, retrieval score, package path, prerequisites, and category.
6. **Compose:** take a bounded candidate set and suppress only near-duplicate content above a conservative Jaccard threshold. Return alternatives separately.

Curated `keywords` provide alternate task vocabulary, while `not_for` describes common near-misses and applies a negative BM25 field weight. The ranking score is an internal retrieval signal, not a calibrated probability. The registry can carry explicit `not_for` boundaries; matching those terms applies a negative field weight so common near-miss requests are less likely to select a skill. These boundaries are curated scope guidance, not an authorization or safety mechanism. The current implementation is deterministic: identical catalogue contents and input query produce the same ordering.

## Commands

```bash
# Search by a natural-language task
python scripts/librarian.py find "build a native app with offline forms"

# Suggest a compact skill set for a cross-domain task
python scripts/librarian.py compose "review onboarding events and retention metrics" --max-skills 4

# Filter by domain
python scripts/librarian.py find "review a release test plan" --domain software-engineering

# Inspect a skill's metadata and prerequisites
python scripts/librarian.py inspect quality-assurance

# List all skills in a domain
python scripts/librarian.py list --domain research

# Machine-readable output for host adapters
python scripts/librarian.py compose "design a resilient cloud migration" --json
```

## Python interface

A host adapter can import `load_catalog`, `rank_documents`, `search_catalog`, and `compose_catalog` from `scripts/librarian.py`. The public CLI's JSON output is intended as a practical integration point while a versioned adapter contract is developed.

## Evaluation

Run:

```bash
python scripts/evaluate_librarian.py
python scripts/evaluate_librarian.py --top-k 10 --json
```

The report measures:
- **Hit@1:** target skill appears first for a positive activation fixture.
- **Hit@K:** target skill appears somewhere in the top K for a positive fixture.
- **MRR:** mean reciprocal rank of the target skill over positive fixtures.
- **Negative false activation:** target skill appears in the top result or top K for a negative fixture.

The dataset consists of the author-written `evals/evals.json` files in the catalogue. It is not held out, and the fixture author also wrote the skill descriptions and instructions. Treat it as a smoke test and baseline, not an independent benchmark.

## Known limitations

- Lexical retrieval can miss synonyms, paraphrases, multilingual queries, and concepts expressed with different vocabulary.
- `not_for` boundaries are manual hints and can over-penalize a task that legitimately needs the skill; inspect `excluded_terms` in JSON output.
- BM25 does not understand task intent, prerequisites, causal dependencies, or the actual quality of a skill.
- The current overlap filter detects near-identical token sets; it is not semantic duplicate detection.
- The composition step does not yet build dependency graphs or ordered multi-skill workflows.
- The evaluator does not run agent hosts or measure whether a skill improves task outcomes.
- Scores should not be compared across different catalogue sizes or weight configurations without a controlled benchmark.

## Next architecture steps

1. Add a stable JSON schema for Librarian request/response objects.
2. Add a host adapter interface so an OSS runtime can request `find` or `compose` without shelling out.
3. Build a held-out, human-reviewed routing dataset and measure retrieval precision/recall across task families.
4. Add optional semantic retrieval/reranking behind a pluggable backend. Keep BM25 available as a no-model fallback.
5. Add live skill-on/skill-off evaluation only when a host CLI and isolated execution environment are explicitly configured.
6. Use evaluation failures to tune descriptions, body content, aliases, and composition rules—not just increase catalogue size.

## Safety and trust boundary

Skill files are untrusted instruction content. The Librarian treats them as searchable text only. It does not run embedded scripts, load external resources, or convert package instructions into new tool permissions. A host must apply its own policy and approval controls before execution.
