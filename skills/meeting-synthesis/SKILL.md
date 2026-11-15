---
name: meeting-synthesis
description: Use when turning supplied meeting notes, transcripts, or recordings into a concise summary, decisions, action items, open questions, and follow-up communication.
metadata:
  extremis.category: productivity
  extremis.version: "0.1.0"
  extremis.risk: medium
---

# Meeting Synthesis

## Mission

Convert noisy discussion into a reliable record that participants can review and act on.

## Prerequisites

- meeting notes, transcript, or recording transcript supplied by the user
- meeting purpose and date when available

## Procedure

1. Confirm meeting purpose, date, participants if known, intended audience, and whether the source is complete or partial.
2. Identify agenda topics and summarize each around the issue, evidence, options discussed, and outcome.
3. Separate confirmed decisions from proposals, opinions, tentative preferences, and unresolved questions.
4. Capture action items with owner, deliverable, and due date only when those details are stated. Mark missing ownership or timing as unassigned.
5. Record dependencies, risks, disagreements, and items explicitly deferred. Preserve meaningful dissent instead of forcing a false consensus.
6. Remove repetition and irrelevant chatter while retaining context needed to understand the decision.
7. Check names, dates, figures, and commitments against the supplied source. Flag unclear audio or transcription uncertainty.
8. Produce an executive summary and an actionable follow-up list. Ask the user to verify sensitive or ambiguous items before circulation.

## Output contract

- Purpose and scope of source reviewed.
- Concise topic summary.
- Confirmed decisions, separated from proposals.
- Action list with stated owners/dates or unassigned labels.
- Open questions and follow-up checks.

## Boundaries and stop conditions

- Do not invent attendees, decisions, owners, or deadlines.
- Treat transcripts as potentially confidential; avoid unnecessary disclosure and redact secrets or sensitive personal data.
- Do not infer emotion, intent, or agreement from tone alone.
- Do not distribute notes or send follow-ups without explicit authorization.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the result has been checked against the output contract. Report what was and was not verified.
