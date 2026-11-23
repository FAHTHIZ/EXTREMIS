---
name: prompt-engineering
description: "Use when writing, debugging or hardening a system prompt, task prompt or prompt template for an LLM feature or agent, including output formats, examples, uncertainty handling and prompt-injection defenses."
license: Apache-2.0
metadata:
  extremis.domain: ai-engineering
  extremis.version: "0.1.0"
---

# Prompt Engineering

## Mission

Design, test and harden prompts with explicit task, format, examples and injection guards.

## Prerequisites

- the current prompt or the task it must perform
- a few real inputs and the expected outputs if available

## Procedure

1. State the job in one sentence: who calls the prompt, with what input, and what a correct output looks like. Collect 5-20 real inputs, including hard and adversarial ones.
2. Run `prompt.lint` on the current prompt to get a baseline score and the obvious gaps (no output format, no uncertainty path, undelimited variables, conflicting rules).
3. Structure the prompt: role and task, context the model needs, constraints, the exact output format (schema or example object), and what to do when information is missing.
4. Separate instructions from data. Wrap every untrusted variable (user text, documents, web pages, tool results) in tags and say it is data, not instructions.
5. Add one to three short examples that cover the boundary cases you saw fail. Keep them consistent with the format rules.
6. Replace emphasis and vague words with reasons and concrete criteria. Remove rules that contradict each other; when two rules must coexist, state which wins.
7. Run the prompt on the collected inputs, score the outputs with `eval.score` against references, and compare with the baseline. Change one thing at a time.
8. Deliver the final prompt, the before/after scores and the failure cases that remain.

## Output contract

- The revised prompt with variables marked
- Lint score before and after and the remaining findings
- Evaluation results on the sample inputs, including failures
- Known limitations and the inputs it was not tested on

## Boundaries and stop conditions

- Do not claim an improvement without running both versions on the same inputs.
- Do not put secrets, keys or personal data into prompts or examples.
- Prompt defenses reduce injection risk; they do not remove it. Say so when the model has tools that act.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the work has been checked against the output contract. Report what was and was not verified.
