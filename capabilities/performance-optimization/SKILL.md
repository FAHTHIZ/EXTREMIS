---
name: performance-optimization
description: "Use when investigating slow code, high latency, excessive memory or CPU use, large bundles, inefficient queries, or resource bottlenecks in an authorized application."
license: Apache-2.0
metadata:
  extremis.domain: software-engineering
  extremis.version: "0.1.0"
---

# Performance Optimization

## Mission

Improve measurable performance without degrading correctness, reliability, security, or maintainability.

## Prerequisites

- reproducible workload or user-visible performance symptom
- profiling, tracing, metrics, or benchmark capability recommended

## Procedure

1. Define the user-visible or system-level performance goal: latency percentile, throughput, startup time, memory, CPU, bundle size, or cost per operation.
2. Establish a baseline using representative inputs, environment, load, warm/cold state, and repeated measurements. Record variance.
3. Profile or trace the workload to identify dominant costs. Separate CPU, I/O, network, lock contention, allocation, database, and rendering bottlenecks.
4. Form a hypothesis that predicts which measurement should change. Avoid speculative rewrites or broad caching before finding the cause.
5. Choose the smallest optimization with acceptable complexity. Consider algorithmic cost, query plans, batching, caching, concurrency, payload size, and critical rendering paths.
6. Preserve correctness and security invariants. For caches, define key scope, freshness, invalidation, isolation, and behavior during backend failure.
7. Re-run the same benchmark and compare distributions, not just one timing. Include resource use and tail latency where relevant.
8. Run regression tests and inspect side effects such as stale data, memory growth, starvation, inconsistent ordering, or increased operational complexity.
9. Report before/after measurements, methodology, environment, trade-offs, and what was not measured.

## Output contract

- Performance objective and baseline.
- Profile-backed bottleneck diagnosis.
- Optimization and trade-off summary.
- Comparable before/after measurements.
- Correctness and regression checks.

## Boundaries and stop conditions

- Do not claim speedups without comparable measurements.
- Do not remove validation, authorization, or correctness checks for performance.
- Do not load-test systems without authorization and sensible limits.
- Treat performance results as workload- and environment-specific.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the result has been checked against the output contract. Report what was and was not verified.
