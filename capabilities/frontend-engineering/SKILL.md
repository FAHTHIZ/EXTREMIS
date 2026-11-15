---
name: frontend-engineering
description: "Use when implementing, debugging, or improving browser-based user interfaces, components, responsive layouts, client-side state, routing, or frontend architecture. Do not use for server-side endpoint handlers, persistence, or backend business logic without a browser-interface task."
license: Apache-2.0
metadata:
  extremis.domain: software-engineering
  extremis.version: "0.1.0"
---

# Frontend Engineering

## Mission

Deliver frontend behavior that is understandable, accessible, responsive, and consistent with the existing codebase.

## Prerequisites

- repository access and the relevant application entry points
- the target browsers/platforms and design or behavior requirements

## Procedure

1. Inspect the framework, build tooling, routing, component conventions, state management, styling system, and current tests before choosing an implementation.
2. Clarify user journeys, responsive breakpoints, states, loading and error behavior, browser support, and acceptance criteria.
3. Trace the current component and data flow. Reuse the design system and existing abstractions unless evidence shows they are inadequate.
4. Implement semantic structure and clear component boundaries. Keep state as local as practical and avoid unnecessary global stores or dependency additions.
5. Handle loading, empty, success, error, offline, and permission-denied states wherever relevant. Provide clear feedback for user actions.
6. Check keyboard interaction, focus order, accessible names, contrast, reduced motion, text scaling, and responsive reflow.
7. Add component, integration, and end-to-end tests that exercise user-visible behavior. Use visual regression checks only where they add meaningful value.
8. Run lint, type checks, tests, and production build where available. Verify on target viewport/browser combinations when the environment allows.
9. Review the final diff for duplicated logic, dead styles, secrets, unsafe rendering, and unnecessary bundle growth. Document remaining limitations.

## Output contract

- Implementation summary and affected components.
- Key user states and responsive behavior addressed.
- Accessibility and browser compatibility checks.
- Tests/build commands and observed results.
- Known limitations and follow-up risks.

## Boundaries and stop conditions

- Do not claim a browser or device was tested unless it was actually tested.
- Do not insert untrusted content as executable HTML or bypass framework escaping.
- Do not add analytics or tracking without the user's purpose and appropriate consent.
- Preserve existing user changes and obtain approval before destructive rewrites.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the result has been checked against the output contract. Report what was and was not verified.
