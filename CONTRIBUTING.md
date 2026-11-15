# Contributing to EXTREMIS

Thank you for helping build a useful, portable capability library.

## Before proposing a skill

1. Search the existing catalog for overlap.
2. Explain the recurring task and why a skill is the right artifact.
3. Identify required tools, data, permissions, runtime, and host assumptions.
4. Check upstream projects for reusable work and record license/provenance.
5. Keep the initial scope narrow enough to evaluate.

## Required skill package

At minimum, submit:
- `skills/<skill-name>/SKILL.md`;
- a registry entry with category, version, maturity, risk, prerequisites, and provenance;
- evaluation cases covering normal, edge, failure, and non-trigger behavior.

Add references, scripts, or assets only when they materially improve reliability. Every executable script needs a documented runtime and safe usage contract.

## Review checklist

- [ ] Directory name matches frontmatter `name`.
- [ ] Description states when to activate the skill.
- [ ] Scope is coherent and non-duplicative.
- [ ] Prerequisites and unavailable-tool behavior are explicit.
- [ ] Output contract and stop conditions are clear.
- [ ] No permission escalation, secret harvesting, or policy override.
- [ ] External material has compatible licensing and attribution.
- [ ] Evaluations are meaningful and not self-congratulatory.
- [ ] Registry metadata is complete and accurate.

## Development checks

Run:

```bash
python scripts/validate_skills.py
python -m unittest discover -s tests -v
```

A successful structural check does not replace human review or behavioral evaluation.

## Licensing

The repository has not selected a project-wide license yet. Do not assume contributions are reusable under an unstated license. Do not copy third-party skill content without checking its license and preserving required notices.
