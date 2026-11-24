# Skill quality and lifecycle

A skill is a maintained capability package, not a prompt-shaped placeholder.

## Required quality dimensions

1. **Purpose:** one coherent outcome and precise activation description.
2. **Procedure:** actionable steps, decision points, and edge-case handling.
3. **Contracts:** inputs, prerequisites, outputs, and stop conditions.
4. **Portability:** no assumed host tools unless declared as prerequisites.
5. **Trust:** provenance, license, and safe treatment of untrusted content.
6. **Efficiency:** progressive disclosure; load only the instructions and references needed.
7. **Evaluation:** cases that measure behavior, including non-trigger and failure cases.
8. **Maintenance:** owner, version, review date, and known limitations in registry metadata.

## Maturity levels

- **Draft:** useful initial content, not yet independently evaluated.
- **Reviewed:** authoring checklist and technical review completed.
- **Validated:** structural checks and evaluation cases pass.
- **Maintained:** has an owner, version history, and scheduled or event-driven review.

Passing a parser or deterministic retrieval fixture is not evidence that the procedure is correct. Do not label a skill validated until behavioral evaluations have actually run.

## Evaluation design

Include normal, boundary, missing-input, failure, and non-trigger examples. Score:
- task completion and correctness;
- evidence and uncertainty handling;
- compliance with prerequisites and permissions;
- output contract;
- unnecessary actions or context use.

Prefer observable criteria over subjective "good answer" ratings. Record evaluator/model/version and date for benchmark runs. Never fabricate scores.

## Change policy

Changes that broaden triggers, alter safety boundaries, add dependencies, or change expected outputs require updated evaluations and a changelog note. Preserve backwards compatibility where practical; otherwise document breaking changes.


## Routing evaluation versus behavior evaluation

EXTREMIS includes a deterministic lexical-routing baseline. Its routing evaluator measures whether a skill is retrieved for its own positive fixtures (Hit@1, Hit@K, and MRR) and how often it appears for negative fixtures. This assesses the selector against author-written prompts only.

It does **not** run an agent, grade a generated answer, compare skill-on/skill-off task outcomes, or establish causal improvement. A behavior benchmark must:
- execute the same task with and without the candidate skill;
- use isolated, reproducible workspaces and identical task inputs;
- apply observable assertions and, where needed, blinded grading;
- record model, model version, host, skill commit, task fixture, environment, run count, and variance;
- preserve raw outputs and clearly separate deterministic checks from model-graded judgments.

A skill should not become `validated` or `maintained` based on a high retrieval score alone.
