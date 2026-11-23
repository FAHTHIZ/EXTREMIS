---
name: llm-feature-launch
description: "Use when taking an LLM-powered feature or AI agent from prototype to launch: requirements, agent and tool design, prompts, retrieval if needed, evaluation, security review for prompt injection and data leakage, and a release decision."
license: Apache-2.0
metadata:
  extremis.domain: ai-engineering
  extremis.version: "0.1.0"
  extremis.kind: workflow
---

# LLM Feature Launch

## Mission

End-to-end workflow: requirements, agent design, prompts, retrieval, evals, security review and launch. This workflow coordinates other EXTREMIS capabilities; activate each step's capability when you reach it rather than loading them all up front.

## Prerequisites

- the user problem and the prototype or design
- sample inputs and access to the model and data

## Steps

1. **requirements** (`requirements-engineering`): Define the user problem, success metrics, unacceptable failures and human approval points.
2. **design** (`agent-orchestration`): Choose workflow versus agent, define tools, permissions, handoffs, budgets and stop rules. After: requirements. Tools: `decision.weighted_matrix`.
3. **prompts** (`prompt-engineering`): Write and lint the system and task prompts with output formats and injection guards. After: design. Tools: `prompt.lint`.
4. **retrieval** (`rag-engineering`, optional): Build and measure retrieval when the feature answers from documents. After: design.
5. **evaluate** (`llm-evaluation`): Score the feature on a held-out evaluation set and compare with the baseline. After: prompts, retrieval. Tools: `eval.score`, `stats.compare_samples`.
6. **security** (`threat-modeling`): Threat-model prompt injection, data leakage through tools and abuse; confirm mitigations. After: design. Tools: `security.secret_scan`.
7. **launch** (`release-readiness`): Make the go or no-go decision with eval and security evidence, rollout and rollback plan. After: evaluate, security.

Steps without an `after` list can run in parallel. Skip an optional step only when its input does not exist, and say so in the output.

## Done when

- Evaluation results on a held-out set meet the success metric with stated uncertainty
- Prompt-injection and data-leakage threats have mitigations or accepted owners
- Irreversible agent actions require human approval
- A rollout, monitoring and rollback plan exists

## Output

A short summary of each completed step, the evidence it produced (tool output or file references), anything skipped and why, and the final deliverable.

## Guardrails

- Do not mark a step done without its evidence.
- Stop and report if a step finds a blocking problem; do not continue to later steps as if it passed.
- Keep scope to what the requester is authorized to change or assess.
