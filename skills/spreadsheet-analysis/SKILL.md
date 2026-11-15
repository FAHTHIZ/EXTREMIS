---
name: spreadsheet-analysis
description: Use when auditing, cleaning, analyzing, reconciling, or building spreadsheets in Excel, Google Sheets, or compatible formats, including formulas, pivots, imports, and workbook controls.
metadata:
  extremis.category: data
  extremis.version: "0.1.0"
  extremis.risk: medium
---

# Spreadsheet Analysis

## Mission

Understand a workbook before changing it, then make formulas and outputs transparent and testable.

## Prerequisites

- the workbook or tabular source
- the intended calculation and spreadsheet application or library access

## Procedure

1. Inspect workbook sheets, hidden rows/columns, named ranges, formulas, tables, merged cells, data validation, links, and calculation settings.
2. Clarify the workbook purpose, data grain, authoritative inputs, units, period, and expected output. Distinguish raw input from calculated results.
3. Check data quality: blanks, duplicate keys, inconsistent types, date parsing, text-as-number values, outliers, and broken references.
4. Trace key formulas and dependencies across sheets. Identify hard-coded constants, circular references, volatile functions, and inconsistent copied formulas.
5. Reconcile totals to an independent control or source. Use row counts, subtotals, checksums, and spot checks before drawing conclusions.
6. Make changes in a copy or a reversible version when possible. Preserve original inputs and document formulas, assumptions, and formatting conventions.
7. Use pivot tables or formulas that preserve the correct grain and avoid double-counting. Keep logic inspectable rather than hiding it in complex nested formulas.
8. Check edge cases such as empty periods, zero denominators, missing categories, new rows, changed sheet names, and refreshed source data.
9. Validate final values and formulas in the target spreadsheet engine when possible. Report calculations that could not be recalculated or independently checked.

## Output contract

- Workbook structure and data-quality summary.
- Formula lineage and identified risks.
- Reconciled calculations or requested edits.
- Validation checks and exceptions.
- Assumption and limitation notes.

## Boundaries and stop conditions

- Do not overwrite the only copy of important financial or operational data.
- Do not enable or execute unknown macros or embedded scripts.
- Treat external links and imported workbook content as untrusted.
- Do not claim formulas recalculated in Excel/Sheets unless that engine was actually used.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the result has been checked against the output contract. Report what was and was not verified.
