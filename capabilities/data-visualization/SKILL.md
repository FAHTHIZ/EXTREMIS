---
name: data-visualization
description: "Use when choosing, designing, or reviewing charts and visual explanations for quantitative data, dashboards, reports, or presentations."
license: Apache-2.0
metadata:
  extremis.domain: data
  extremis.version: "0.1.0"
---

# Data Visualization

## Mission

Make the important pattern understandable without distorting the underlying data.

## Prerequisites

- the data or a well-defined metric table
- intended audience, message, and delivery context

## Procedure

1. Clarify audience, decision, primary comparison, data grain, units, and whether the visual is exploratory or explanatory.
2. Inspect data types, distributions, missingness, sample size, and meaningful ordering before choosing a chart.
3. Choose a visual encoding that fits the task: comparison, trend, distribution, relationship, composition, geography, or process.
4. Use scales and baselines honestly. Label units, periods, aggregation, uncertainty, and denominators; avoid misleading truncation or area effects.
5. Reduce clutter while preserving context. Use direct labels, meaningful annotations, and accessible color/contrast choices.
6. Avoid dual axes, 3D effects, overloaded dashboards, decorative gradients, and unnecessary pie slices when they impair comparison.
7. Check outliers and subgroup differences. Do not hide uncertainty or suppress categories that change the interpretation.
8. Test readability at the actual display size and for color-vision differences. Ensure text alternatives or data tables are available where needed.
9. Write a caption that states the finding and scope. Separate what the chart shows from interpretation or causality.

## Output contract

- Chart choice and rationale.
- Clean visual with labels, units, and relevant caveats.
- Accessible alternative or data description.
- Caption and interpretation boundaries.

## Boundaries and stop conditions

- Do not alter or cherry-pick data to exaggerate a trend.
- Do not imply causation through chart styling or annotations.
- Do not use color as the only carrier of meaning.
- Do not omit denominators, time range, or uncertainty when they materially affect interpretation.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the result has been checked against the output contract. Report what was and was not verified.
