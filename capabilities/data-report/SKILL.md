---
name: data-report
description: "Use when turning a raw dataset into a finished analytical report: profile and clean the data, analyse it, chart the findings and write up conclusions with caveats."
license: Apache-2.0
metadata:
  extremis.domain: data
  extremis.version: "0.1.0"
  extremis.kind: workflow
---

# Data Report

## Mission

Workflow: profile, analyse, visualise and write up a dataset as a report. This workflow coordinates other EXTREMIS capabilities; activate each step's capability when you reach it rather than loading them all up front.

## Prerequisites

- a dataset file (CSV, JSON or spreadsheet export)
- the question the report should answer

## Steps

1. **profile** (`data-analysis`): Profile columns, types, missing values and duplicates before analysis. Tools: `data.profile`.
2. **analyse** (`data-analysis`): Answer the question with queries and summary statistics. After: profile. Tools: `data.query`, `stats.describe`.
3. **chart** (`data-visualization`): Chart the two or three findings that matter most. After: analyse. Tools: `data.chart_svg`.
4. **write** (`content-writing`): Write the report: question, method, findings, caveats and next steps. After: chart.

Steps without an `after` list can run in parallel. Skip an optional step only when its input does not exist, and say so in the output.

## Done when

- Data quality issues are reported before conclusions
- Every number in the report traces to a query or statistic
- Limitations and caveats are stated

## Output

A short summary of each completed step, the evidence it produced (tool output or file references), anything skipped and why, and the final deliverable.

## Guardrails

- Do not mark a step done without its evidence.
- Stop and report if a step finds a blocking problem; do not continue to later steps as if it passed.
- Keep scope to what the requester is authorized to change or assess.
