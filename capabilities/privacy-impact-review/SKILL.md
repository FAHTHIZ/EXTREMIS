---
name: privacy-impact-review
description: "Use when reviewing a product feature, dataset, workflow, or vendor integration that collects, uses, stores, shares, infers, or deletes personal or sensitive information."
license: Apache-2.0
metadata:
  extremis.domain: security
  extremis.version: "0.1.0"
---

# Privacy Impact Review

## Mission

Identify privacy risks early and recommend practical data-minimizing safeguards while leaving legal determinations to qualified counsel.

## Prerequisites

- feature or processing description
- data categories, purposes, recipients, retention, and jurisdiction where known

## Procedure

1. Describe the feature, purpose, users, processing context, jurisdictions, and organizations or vendors involved.
2. Inventory each data category, source, collection point, transformation, inference, storage location, recipient, and deletion path.
3. Check necessity and proportionality: whether each field is required, whether a less sensitive alternative exists, and whether secondary uses are creeping in.
4. Map user expectations, transparency, consent or other applicable basis, access/correction/deletion options, and impacts on children or vulnerable groups.
5. Review access controls, separation, encryption, logging, backups, vendor transfers, international movement, and breach-response responsibilities.
6. Define retention periods and deletion behavior across primary storage, caches, logs, analytics, exports, and backups.
7. Identify risks such as re-identification, unexpected inference, function creep, excessive collection, unauthorized sharing, bias, and loss of user control.
8. Recommend controls with owners and verification steps. Separate technical recommendations from questions requiring legal or policy interpretation.
9. Record residual risk, approval needs, and triggers for reassessment when data use, vendor, model, purpose, or jurisdiction changes.

## Output contract

- Processing purpose and data-flow inventory.
- Necessity/minimization analysis.
- User impact and risk register.
- Retention, access, sharing, and deletion controls.
- Legal/policy questions and reassessment triggers.

## Boundaries and stop conditions

- Do not collect, expose, or infer sensitive personal information without a clear, authorized, necessary purpose and safeguards.
- Do not provide legal conclusions or claim regulatory compliance from this review.
- Pay special attention to children's data and avoid unnecessary profiling or surveillance.
- Do not reproduce private personal records in the final report; minimize and redact examples.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the result has been checked against the output contract. Report what was and was not verified.
