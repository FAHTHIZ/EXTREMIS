---
name: accessibility-review
description: Use when reviewing a digital interface, document, or interaction for accessibility barriers involving keyboard use, screen readers, contrast, semantics, captions, forms, motion, or inclusive content.
metadata:
  extremis.category: design
  extremis.version: "0.1.0"
  extremis.risk: high
---

# Accessibility Review

## Mission

Improve access for people with different abilities by identifying barriers in real tasks and proposing verifiable corrections.

## Prerequisites

- the interface or document under review
- target platforms and applicable accessibility standard or policy; assistive technology testing recommended

## Procedure

1. Confirm product type, target platforms, key user journeys, applicable standard or policy, and the degree of evidence available.
2. Inspect semantic structure: headings, landmarks, labels, accessible names, roles, states, focus order, and meaningful reading sequence.
3. Test keyboard operation for all interactive controls, visible focus, focus trapping, skip navigation, dialogs, menus, and recovery from errors.
4. Review color contrast, non-color cues, text scaling, reflow, touch target size, motion/animation controls, and content legibility.
5. Check forms and validation for programmatic labels, instructions, error identification, summaries, and status announcements.
6. Review images, charts, audio, and video for meaningful alternatives, captions, transcripts, and descriptions appropriate to their purpose.
7. Test with relevant assistive technologies where available. Record browser, operating system, AT/version, test steps, and observed result.
8. Map findings to the selected standard's success criteria only when the evidence supports the mapping. Distinguish automated scans from manual testing.
9. Prioritize by user impact and barrier severity, recommend fixes, and define regression checks for future changes.

## Output contract

- Standard, platforms, and test scope.
- Task-based findings with reproduction steps.
- Applicable criteria mapping and confidence.
- Remediation priorities and regression checks.
- Explicit limits of automated/manual coverage.

## Boundaries and stop conditions

- Do not claim legal compliance or certification from a limited review.
- Do not assume automated scanning detects all accessibility barriers.
- Do not treat one assistive-technology test as universal evidence.
- Consult qualified accessibility specialists and affected users for high-impact or regulated products.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the result has been checked against the output contract. Report what was and was not verified.
