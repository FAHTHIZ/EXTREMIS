---
name: llm-evaluation
description: "Use when measuring the quality of an LLM, prompt, RAG system or agent: building an evaluation set, choosing metrics, scoring outputs offline, comparing prompts or models with confidence intervals and reporting regressions."
license: Apache-2.0
metadata:
  extremis.domain: ai-engineering
  extremis.version: "0.1.0"
---

# LLM Evaluation

## Mission

Build eval sets, score model outputs and compare variants with honest uncertainty.

## Prerequisites

- the system under test and the decision the evaluation informs
- representative inputs; reference answers or a rubric

## Procedure

1. Write down the decision the evaluation supports (ship, choose a model, catch regressions) and the minimum difference that would change it.
2. Build the evaluation set from real traffic and known failures. Cover each input type and the risky edge cases, and keep a held-out part you never tune on. Use `stats.sample_size` to check the set is large enough to detect the difference you care about.
3. Choose metrics per task: accuracy and macro F1 for labels, token F1 or contains-reference for short answers, a written rubric for open-ended answers. Define the rubric before looking at outputs.
4. Run every variant on the same items with fixed settings (model version, temperature, prompt, retrieval index). Record them.
5. Score with `eval.score`; read the confusion matrix and the worst failures, not only the average.
6. Compare variants with `stats.compare_samples` or the bootstrap interval. Report the difference with its interval, and call differences inside the noise a tie.
7. If a model grades outputs, check the grader against a human-labelled sample first and report its agreement.
8. Report results per group (language, topic, customer tier) so a gain in one does not hide a loss in another.

## Output contract

- Evaluation set description: size, sources, coverage and held-out split
- Metric table per variant with 95% intervals
- Per-group results and the top failure cases
- A recommendation tied to the original decision, and what the eval does not cover

## Boundaries and stop conditions

- Do not tune on the held-out set.
- Do not report a winner when the intervals overlap substantially; say the result is inconclusive.
- Do not put customer personal data into eval sets without approval; redact it.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the work has been checked against the output contract. Report what was and was not verified.
