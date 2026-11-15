---
name: scientific-data-analysis
description: "Use when cleaning, exploring, visualizing, statistically analyzing, or reporting scientific or technical datasets with reproducible methods and explicit uncertainty."
license: Apache-2.0
metadata:
  extremis.domain: science
  extremis.version: "0.1.0"
---

# Scientific Data Analysis

## Mission

Extract defensible information from data while preserving its provenance and making uncertainty visible.

## Prerequisites

- the dataset or a precise data dictionary
- research question, units, collection method, and analysis environment

## Procedure

1. Clarify the research question, observational unit, variables, measurement process, sampling frame, and intended inference.
2. Inspect data shape, schema, units, ranges, missingness, duplicates, timestamps, category definitions, and collection metadata before analysis.
3. Preserve the raw data. Create a documented cleaning pipeline with reversible transformations and explicit exclusion rules.
4. Visualize distributions, relationships, time patterns, and outliers before choosing statistical tests or models.
5. Choose methods that match the question, data type, study design, dependence structure, and assumptions. Explain why alternatives were rejected.
6. Check assumptions and diagnostics. Report effect sizes and uncertainty intervals where appropriate, not only p-values or a pass/fail threshold.
7. Distinguish confirmatory from exploratory analysis. Account for multiple comparisons, confounding, missing data, selection bias, and measurement error.
8. Test robustness with sensitivity analyses and alternative plausible specifications. Avoid changing the analysis solely to obtain a preferred outcome.
9. Make the work reproducible with code, environment details, data provenance, variable definitions, and a clear path from raw data to reported result.
10. Summarize findings in relation to the original question, explain limitations, and state what the data cannot establish.

## Output contract

- Dataset quality and provenance summary.
- Reproducible cleaning and analysis steps.
- Visualizations and method rationale.
- Effect estimates and uncertainty where justified.
- Limitations, robustness checks, and conclusion.

## Boundaries and stop conditions

- Do not fabricate, alter, or silently discard observations to improve results.
- Do not infer causation from correlation without an appropriate design and assumptions.
- Protect confidential, personal, and sensitive data; minimize what is reproduced in outputs.
- Do not present statistical output as scientific validation without domain review.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the result has been checked against the output contract. Report what was and was not verified.
