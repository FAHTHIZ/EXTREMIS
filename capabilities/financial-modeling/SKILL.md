---
name: financial-modeling
description: "Use when building or reviewing an educational or business financial model, budget, forecast, cash-flow projection, unit-economics model, or scenario analysis from explicit assumptions."
license: Apache-2.0
metadata:
  extremis.domain: finance
  extremis.version: "0.1.0"
---

# Financial Modeling

## Mission

Create a transparent calculation model that helps explain how assumptions drive outcomes. The model is a decision aid, not a promise about future results.

## Prerequisites

- the decision context and model horizon
- provided inputs or clearly labeled assumptions
- spreadsheet or calculation capability recommended

## Procedure

1. Clarify the model's purpose, audience, currency, time period, granularity, and decision it is intended to inform.
2. Collect source inputs and record units, dates, definitions, and provenance. Separate observed historical data from estimates and user-supplied assumptions.
3. Define the model structure before calculating: revenue or inflows, direct and indirect costs, working capital, capital expenditure, taxes where relevant, financing, and cash timing.
4. Build a base case and clearly bounded upside/downside scenarios. Change a small number of defensible drivers rather than inventing false precision.
5. Make formulas explicit and auditable. Avoid hard-coded outputs, circular references, hidden plugs, inconsistent periods, and mixing nominal with real values.
6. Check internal consistency: totals, signs, units, timing, opening/closing balances, cash reconciliation, and links between statements where applicable.
7. Run sensitivity analysis on the assumptions that matter most. Show break-even points and ranges; do not imply that a scenario is a probability unless a defensible method supports it.
8. Document exclusions, limitations, and the assumptions that would change the conclusion. Have consequential real-world decisions reviewed by an appropriately qualified professional.

## Output contract

- Model purpose, scope, units, and time horizon.
- Source/assumption ledger with dates and confidence.
- Base, upside, and downside scenarios with formulas.
- Sensitivity and break-even analysis.
- Limitations and verification checks.

## Boundaries and stop conditions

- Never present a forecast as a fact or guarantee.
- Do not provide individualized investment, trading, lending, tax, or legal instructions.
- Do not fabricate source data; label estimates and placeholders visibly.
- For high-stakes decisions, identify the need for qualified professional review.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the result has been checked against the output contract. Report what was and was not verified.
