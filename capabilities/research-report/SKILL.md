---
name: research-report
description: "Use when producing a sourced research report on a question: gather sources, verify claims, synthesize findings and write a cited report with confidence levels."
license: Apache-2.0
metadata:
  extremis.domain: research
  extremis.version: "0.1.0"
  extremis.kind: workflow
---

# Research Report

## Mission

Workflow: gather sources, verify claims, synthesize and write a cited report. This workflow coordinates other EXTREMIS capabilities; activate each step's capability when you reach it rather than loading them all up front.

## Prerequisites

- a clearly stated research question
- network access for web sources, or supplied documents

## Steps

1. **gather** (`research-synthesis`): Collect primary and secondary sources relevant to the question. Tools: `web.fetch_text`, `doc.extract_text`.
2. **verify** (`source-verification`): Check key claims against independent or primary sources. After: gather.
3. **literature** (`literature-review`, optional): Add peer-reviewed or formal literature where it exists. After: gather.
4. **write** (`content-writing`): Write the report with inline citations and confidence levels. After: verify, literature.

Steps without an `after` list can run in parallel. Skip an optional step only when its input does not exist, and say so in the output.

## Done when

- Every factual claim has a citation
- Conflicting evidence is reported rather than hidden
- Confidence and open questions are stated

## Output

A short summary of each completed step, the evidence it produced (tool output or file references), anything skipped and why, and the final deliverable.

## Guardrails

- Do not mark a step done without its evidence.
- Stop and report if a step finds a blocking problem; do not continue to later steps as if it passed.
- Keep scope to what the requester is authorized to change or assess.
