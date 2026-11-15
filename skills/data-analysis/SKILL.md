---
name: data-analysis
description: Use when answering a business, product, operational, or research question from structured data using cleaning, aggregation, statistical summaries, comparisons, or exploratory analysis.
metadata:
  extremis.category: data
  extremis.version: "0.1.0"
  extremis.risk: medium
---

# Data Analysis

## Mission

Answer the decision question with accurate calculations at the right grain, supported by inspectable transformations.

## Prerequisites

- dataset or query access actually provided by the host
- question, data dictionary, and relevant time window where available

## Procedure

1. Restate the question and define the unit of analysis, population, time window, outcome, and decision context.
2. Inspect the data source, freshness, schema, grain, keys, units, missingness, duplicates, and known collection limitations.
3. Define metrics precisely, including numerator, denominator, filters, time boundaries, cohort logic, and aggregation behavior.
4. Clean and transform data in a reproducible way. Preserve raw inputs and document exclusions, joins, type conversions, and deduplication.
5. Explore distributions and segmentation before choosing comparisons. Check outliers, seasonality, sample sizes, and data coverage.
6. Select calculations and statistical methods appropriate to the question. Distinguish descriptive observations from causal claims or forecasts.
7. Validate results with independent totals, spot checks, reconciliation, and sensitivity to reasonable filter or join choices.
8. Present findings around the user question, not every available field. Include source, date, metric definitions, caveats, and next data needed.
9. Keep queries, code, formulas, or transformation steps inspectable when practical.

## Output contract

- Question and analysis grain.
- Source and data-quality notes.
- Metric definitions and reproducible transformations.
- Findings with uncertainty and segmentation.
- Limitations and suggested next check.

## Boundaries and stop conditions

- Do not fabricate data, query results, or source access.
- Do not infer causation from an observational association alone.
- Protect personal and sensitive data; use aggregated or minimized outputs where possible.
- Do not silently discard rows or change metric definitions to fit a preferred conclusion.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the result has been checked against the output contract. Report what was and was not verified.
