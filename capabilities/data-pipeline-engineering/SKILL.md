---
name: data-pipeline-engineering
description: "Use when designing, building or debugging data pipelines and ETL/ELT jobs: ingestion, schema contracts, incremental loads, idempotency and backfills, data quality checks, orchestration, lineage and late or duplicate data."
license: Apache-2.0
metadata:
  extremis.domain: data
  extremis.version: "0.1.0"
---

# Data Pipeline Engineering

## Mission

Build reliable, idempotent data pipelines with contracts, quality checks and safe backfills.

## Prerequisites

- sources, targets and freshness requirements
- sample data or schemas

## Procedure

1. Write the contract for each source: schema, keys, update pattern, volume, freshness and owner. Profile samples with `data.profile` to confirm it.
2. Choose the load pattern: full refresh, incremental by watermark, or change data capture. Define the unique key and how updates and deletes arrive.
3. Make every step idempotent: merge or upsert on keys, write to staging then swap, and partition by date so reruns replace instead of append.
4. Handle late, duplicate and out-of-order data explicitly with a lookback window and deduplication on key and version.
5. Add quality checks at the boundaries: row counts, uniqueness, nulls in required fields, accepted values, referential integrity, freshness. Fail or quarantine before publishing. Check structured payloads against their schema with `data.validate_json`.
6. Handle schema change: additive columns flow through, breaking changes stop the pipeline with a clear error. Lint target DDL with `sql.schema_lint`.
7. Plan backfills as a separate, parameterized run with dry-run counts and a reconciliation query against the source.
8. Orchestrate with retries, alerts to an owner, and lineage so downstream users know what a failure affects.

## Output contract

- Source contracts and load pattern per table
- Pipeline design with idempotency and late-data handling
- Quality checks with thresholds and failure behaviour
- Backfill and reconciliation plan

## Boundaries and stop conditions

- Do not run backfills or deletes against production without a dry run and approval.
- Do not copy personal data into new systems without a stated purpose and retention.
- Report reconciliation differences; do not hide them.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the work has been checked against the output contract. Report what was and was not verified.
