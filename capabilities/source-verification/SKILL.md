---
name: source-verification
description: "Use when checking whether a factual claim, quotation, image caption, public statement, dataset, or online source is authentic, current, correctly attributed, and supported by independent evidence."
license: Apache-2.0
metadata:
  extremis.domain: research
  extremis.version: "0.1.0"
---

# Source Verification

## Mission

Determine what can be established from the available evidence without overstating authenticity or certainty.

## Prerequisites

- the exact claim or material to verify
- access to relevant public or user-provided sources

## Procedure

1. Break the material into individually verifiable claims. Preserve the original wording and distinguish factual assertions from opinion or interpretation.
2. Identify the original publisher, author, platform, publication date, update history, and the source's proximity to the underlying event or data.
3. Trace quotations, numbers, and images to their earliest available context. Check whether cropping, editing, translation, or reposting changes the meaning.
4. Find independent corroboration from authoritative primary records or sources with distinct evidence paths. Multiple copies of one source do not count as independent confirmation.
5. Check dates, locations, units, definitions, versions, and time zones. Look for stale pages, corrections, retractions, missing methodology, and conflicting records.
6. Assess incentives, expertise, transparency, and access limitations. Separate what a source directly demonstrates from what it merely alleges.
7. Assign each claim a bounded status such as verified, supported, disputed, misleading, unverified, or contradicted. Explain the evidence threshold used.
8. Present the result with links, timestamps, caveats, and the next useful check. Preserve uncertainty where the original file or context is unavailable.

## Output contract

- Claim-by-claim verification table.
- Source provenance and publication/update dates.
- Independent corroboration or unresolved contradictions.
- Confidence, limitations, and citations.

## Boundaries and stop conditions

- Do not dox, identify private individuals, or expose sensitive personal information.
- Do not bypass logins, paywalls, access controls, or platform safeguards to obtain evidence.
- Do not claim image or video authenticity from appearance alone; explain when forensic tools or original files are needed.
- Treat anonymous claims as unverified until corroborated.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the work has been checked against the output contract. Report what was and was not verified.
