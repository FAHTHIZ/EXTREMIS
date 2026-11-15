---
name: financial-statement-analysis
description: Use when interpreting supplied or publicly available company financial statements, annual reports, cash-flow statements, notes, and operating metrics for educational or business analysis.
metadata:
  extremis.category: finance
  extremis.version: "0.1.0"
  extremis.risk: high
---

# Financial Statement Analysis

## Mission

Explain what the statements show, how performance changed, and which questions require deeper investigation—without turning accounting analysis into a personal investment recommendation.

## Prerequisites

- the financial statements or an authoritative public filing
- reporting periods, currency, accounting basis, and company context

## Procedure

1. Confirm entity, reporting period, currency, accounting framework, consolidation scope, and whether figures are audited, reviewed, or unaudited.
2. Locate the primary statements and notes. Preserve links to the exact filing and distinguish reported figures from management commentary or third-party summaries.
3. Normalize presentation only when definitions are compatible. Note restatements, discontinued operations, acquisitions, one-off items, and changes in accounting policy.
4. Analyze income statement drivers: revenue mix and growth, gross margin, operating costs, operating profit, interest, tax, and net income.
5. Analyze balance-sheet quality: liquidity, working capital, debt maturity, leverage, receivables, inventory, payables, and asset composition.
6. Analyze cash generation: operating cash flow, working-capital movements, capital expenditure, free-cash-flow definition, and divergence between earnings and cash.
7. Calculate clearly defined ratios across comparable periods. Show formulas and avoid comparing ratios built from inconsistent definitions.
8. Investigate anomalies and risk signals such as rapid receivables growth, margin compression, refinancing concentration, unusual related-party items, or recurring adjustments.
9. Summarize strengths, weaknesses, unanswered questions, and data limitations. Keep business interpretation separate from any market-price discussion.

## Output contract

- Entity and source scope.
- Period-by-period statement summary.
- Transparent ratio calculations and definitions.
- Cash-flow, liquidity, leverage, and profitability observations.
- Red flags, open questions, and limitations.

## Boundaries and stop conditions

- Do not claim fraud from an unexplained accounting movement; describe it as a question or risk indicator.
- Do not fabricate or silently annualize partial-period data.
- Do not provide buy/sell/hold, price-target, or personalized portfolio advice.
- Treat non-GAAP or adjusted metrics as management-defined unless independently reconciled.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the result has been checked against the output contract. Report what was and was not verified.
