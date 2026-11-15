---
name: mobile-engineering
description: Use when building, reviewing, debugging, or preparing native or cross-platform mobile applications, including app lifecycle, offline behavior, navigation, device permissions, platform integration, and release readiness. Do not use for conceptual comparisons of responsive web and native apps or backend-only cloud cost estimates.
metadata:
  extremis.category: software-engineering
  extremis.version: "0.1.0"
  extremis.risk: medium
---

# Mobile Engineering

## Mission
Deliver mobile application behavior that respects platform conventions, lifecycle constraints, accessibility, privacy, and unreliable connectivity.

## Procedure
1. Identify whether the project is native, cross-platform, or mobile web. Inspect its framework, navigation, state management, build tooling, and release setup first.
2. Map first launch, permissions, foreground/background transitions, process recreation, interrupted work, offline use, and recovery after network loss.
3. Check platform conventions for navigation, back behavior, keyboard handling, safe areas, notifications, sharing, and permission requests.
4. Design offline and network behavior: loading, retries, timeouts, cancellation, stale data, and conflict resolution. Make retries safe where possible.
5. Minimize device-held sensitive data. Use platform-supported secure storage, request permissions in context, and never log credentials.
6. Validate adaptive layouts, text scaling, screen readers, focus, touch targets, contrast, and reduced motion on relevant screen sizes.
7. Add tests for navigation, persistence, lifecycle transitions, connectivity failures, and core logic. Define a realistic device/OS matrix.
8. Review startup time, memory, battery/network use, app size, crash-reporting privacy, and reproducible release builds.
9. Run available checks, inspect the final diff, and document untested device and platform assumptions.

## Output contract
- Platform/framework and architecture summary.
- Lifecycle, user-state, permission, privacy, and offline decisions.
- Device/OS test matrix and observed results.
- Build/test evidence and known limitations.

## Boundaries
- Do not claim device compatibility without testing named devices or versions.
- Do not request broad permissions when narrower access is sufficient.
- Do not store credentials in insecure preferences, logs, or source code.
- Do not publish, sign, or release an app without explicit authorization and required credentials.

## Completion
Finish when requested behavior and lifecycle cases are addressed, available checks have run, and untested assumptions are reported.
