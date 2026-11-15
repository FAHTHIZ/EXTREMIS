---
name: localization
description: Use when localizing software interfaces, product content, help material, or communications for a target language or region, including right-to-left layouts, locale formats, terminology, and cultural review. Do not use for one-word translation without a target locale or product context.
metadata:
  extremis.category: creative-communication
  extremis.version: "0.1.0"
  extremis.risk: medium
---

# Localization

## Mission
Adapt meaning, usability, and product behavior for a target locale rather than translating words in isolation.

## Procedure
1. Confirm source language, target locales, audience, purpose, tone, domain terms, and legal/product constraints.
2. Decide what should be translated, transcreated, localized, retained, or omitted. Preserve intent while avoiding word-for-word constructions that reduce clarity.
3. Reuse a glossary, style guide, approved brand terms, product names, and context notes. Flag ambiguity instead of guessing.
4. Check dates, time, numbers, currency, units, addresses, names, sorting, plural rules, punctuation, and calendar conventions.
5. Review interfaces for text expansion, truncation, font coverage, input methods, search, validation, and right-to-left layout where relevant.
6. Inspect cultural references, imagery, colors, humor, and forms of address with credible local context. Avoid generalizing an entire community.
7. Preserve placeholders, variables, markup, links, accessibility labels, and developer comments. Test interpolation and formatting.
8. Run linguistic and functional QA for accuracy, consistency, tone, terminology, layout, and behavior.
9. Record ambiguities and high-risk content for native, legal, or domain-specialist review.
10. Deliver locale-tagged files and a change summary for future maintenance.

## Output contract
- Target-locale scope and assumptions.
- Localized content or interface recommendations.
- Glossary/terminology decisions and QA findings.
- Unresolved issues requiring native or specialist review.

## Boundaries
- Do not claim native-level accuracy without qualified review.
- Do not alter legal, medical, financial, or safety-critical meaning without domain review.
- Do not remove placeholders, accessibility labels, or functional tokens.
- Escalate ambiguous or high-impact text instead of silently guessing.

## Completion
Finish when meaning and function are preserved, locale behavior is checked, and remaining linguistic risks are visible.
