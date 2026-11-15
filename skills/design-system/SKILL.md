---
name: design-system
description: Use when creating, documenting, auditing, or extending a product design system including design tokens, typography, spacing, color, components, interaction states, and usage guidance.
metadata:
  extremis.category: design
  extremis.version: "0.1.0"
  extremis.risk: low
---

# Design System

## Mission

Turn repeated interface decisions into a small, consistent system that improves product quality without blocking necessary exceptions.

## Prerequisites

- product goals and brand constraints
- existing UI, design files, or framework conventions; component implementation access optional

## Procedure

1. Inventory existing screens and components. Identify repeated patterns, inconsistencies, platform constraints, and user-facing problems before designing new tokens.
2. Define principles and design constraints: audience, brand expression, information density, accessibility, responsive behavior, and supported themes.
3. Create semantic tokens for color, typography, spacing, sizing, radii, borders, elevation, motion, and focus. Separate semantic meaning from raw palette values.
4. Define component anatomy, variants, states, content rules, keyboard behavior, accessible names, responsive behavior, and composition guidance.
5. Document when to use a component and when not to use it. Provide examples of correct and incorrect composition.
6. Map tokens and components to the implementation framework without making the system depend unnecessarily on one tool.
7. Validate representative real screens across viewport sizes, themes, localization lengths, and accessibility checks.
8. Establish versioning, contribution rules, deprecation process, ownership, and visual regression checks. Add new primitives only when a demonstrated need exists.

## Output contract

- Design principles and token inventory.
- Component catalog with anatomy, variants, and states.
- Usage and accessibility guidance.
- Implementation mapping and example screens.
- Governance, contribution, and versioning plan.

## Boundaries and stop conditions

- Do not replace a usable existing system without evidence of need.
- Do not define colors or typography as purely decorative; preserve semantic and accessibility requirements.
- Do not claim components are implemented when only design specs exist.
- Avoid premature abstraction that makes common tasks harder.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the result has been checked against the output contract. Report what was and was not verified.
