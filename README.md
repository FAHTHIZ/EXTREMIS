# EXTREMIS

<p align="center"><strong>One intelligence. Endless capabilities.</strong></p>
<p align="center">A portable, quality-controlled capability library for AI agents.</p>

EXTREMIS is an evolving open capability library for agent hosts. It combines focused skills, workflows, references, and evaluation fixtures. Its core follows the open Agent Skills directory convention so compatible hosts can discover and load capabilities without depending on one model vendor.

## Install

Use the open Skills CLI to install the repository into supported agent hosts:

```bash
npx skills add FAHTHIZ/EXTREMIS --all
```

Install one capability for a chosen host:

```bash
npx skills add FAHTHIZ/EXTREMIS --skill mobile-engineering --agent claude-code
```

The CLI provides cross-host installation and management. EXTREMIS itself is the portable catalog, not a custom installer or marketplace service. Host support and runtime behavior must be verified for each agent.

## What it is

- Portable skills using the open Agent Skills structure.
- A curated catalog with scope, prerequisites, risk, version, provenance, and evaluation fixtures.
- Composable capabilities that load on demand.
- A host-neutral core that does not assume all agents have the same tools or permissions.

## What it is not

- A model, agent runtime, or source of model weights.
- A replacement for browsers, shells, APIs, databases, credentials, or other tools.
- A guarantee that loading instructions makes a model an expert.
- A reason to load every skill into every conversation.

## Library

The catalog contains **54 skills across 15 domains**.

### Meta

Maintain the capability library itself.

- [Skill Authoring](skills/skill-authoring/SKILL.md)

### Software Engineering

Build, inspect, test, review, document, and evolve software.

- [Repository Audit](skills/repository-audit/SKILL.md)
- [Debugging](skills/debugging/SKILL.md)
- [Test Driven Development](skills/test-driven-development/SKILL.md)
- [Code Review](skills/code-review/SKILL.md)
- [API Design](skills/api-design/SKILL.md)
- [Database Design](skills/database-design/SKILL.md)
- [Technical Documentation](skills/technical-documentation/SKILL.md)
- [Mobile Engineering](skills/mobile-engineering/SKILL.md)
- [Quality Assurance](skills/quality-assurance/SKILL.md)
- [Backend Engineering](skills/backend-engineering/SKILL.md)
- [Devops Release](skills/devops-release/SKILL.md)
- [Frontend Engineering](skills/frontend-engineering/SKILL.md)
- [Performance Optimization](skills/performance-optimization/SKILL.md)

### Research

Investigate questions, review literature, and verify source claims.

- [Research Synthesis](skills/research-synthesis/SKILL.md)
- [Literature Review](skills/literature-review/SKILL.md)
- [Source Verification](skills/source-verification/SKILL.md)

### Finance

Analyze statements and model business scenarios with visible assumptions.

- [Financial Modeling](skills/financial-modeling/SKILL.md)
- [Financial Statement Analysis](skills/financial-statement-analysis/SKILL.md)

### Business

Discover product opportunities, estimate markets, improve processes, and evaluate suppliers.

- [Product Discovery](skills/product-discovery/SKILL.md)
- [Market Sizing](skills/market-sizing/SKILL.md)
- [Process Mapping](skills/process-mapping/SKILL.md)
- [Competitive Analysis](skills/competitive-analysis/SKILL.md)
- [Procurement Analysis](skills/procurement-analysis/SKILL.md)

### Design

Evaluate UX, accessibility, and reusable design systems.

- [UX Audit](skills/ux-audit/SKILL.md)
- [Accessibility Review](skills/accessibility-review/SKILL.md)
- [Design System](skills/design-system/SKILL.md)

### Education

Support learners and design structured learning experiences.

- [Study Coaching](skills/study-coaching/SKILL.md)
- [Learning Design](skills/learning-design/SKILL.md)

### Science

Design ethical studies and analyze scientific data reproducibly.

- [Experimental Design](skills/experimental-design/SKILL.md)
- [Scientific Data Analysis](skills/scientific-data-analysis/SKILL.md)

### Engineering

Translate system needs into requirements and assess resilience and operations.

- [Technical Planning](skills/technical-planning/SKILL.md)
- [Systems Engineering](skills/systems-engineering/SKILL.md)
- [Reliability Analysis](skills/reliability-analysis/SKILL.md)
- [Cloud Architecture](skills/cloud-architecture/SKILL.md)
- [Incident Management](skills/incident-management/SKILL.md)
- [Requirements Engineering](skills/requirements-engineering/SKILL.md)

### Security

Defensively review authorized systems and reduce security/privacy risks.

- [Secure Code Review](skills/secure-code-review/SKILL.md)
- [Threat Modeling](skills/threat-modeling/SKILL.md)
- [Privacy Impact Review](skills/privacy-impact-review/SKILL.md)

### Data

Analyze structured datasets, communicate patterns, and measure product behavior.

- [Data Analysis](skills/data-analysis/SKILL.md)
- [Data Visualization](skills/data-visualization/SKILL.md)
- [Spreadsheet Analysis](skills/spreadsheet-analysis/SKILL.md)
- [Product Analytics](skills/product-analytics/SKILL.md)

### Marketing

Improve audience understanding and ethical product discoverability.

- [Marketing Strategy](skills/marketing-strategy/SKILL.md)
- [Search Optimization](skills/search-optimization/SKILL.md)

### Creative Communication

Write, localize, and design communications with audience and context fit.

- [Content Writing](skills/content-writing/SKILL.md)
- [Presentation Design](skills/presentation-design/SKILL.md)
- [Localization](skills/localization/SKILL.md)

### Customer Operations

Triage support requests and guide customers through verified next steps.

- [Customer Support](skills/customer-support/SKILL.md)

### Productivity

Coordinate projects, preserve decisions, and maintain organizational knowledge.

- [Project Management](skills/project-management/SKILL.md)
- [Meeting Synthesis](skills/meeting-synthesis/SKILL.md)
- [Decision Log](skills/decision-log/SKILL.md)
- [Knowledge Management](skills/knowledge-management/SKILL.md)

See the [domain map](docs/domain-map.md), [skill index](registry/skills-index.json), and [domain registry](registry/domains.json).

## Selection and execution

1. Discover candidates from names, descriptions, and domain metadata.
2. Check task fit, prerequisites, trust, host compatibility, risk, and overlap.
3. Load only selected instructions and relevant references.
4. Execute using tools actually available to the host and permissions granted by the user.
5. Verify output against acceptance criteria and report what was not tested.
6. Improve skills using evaluation failures and feedback without silently broadening scope.

## Quality and evaluation

Every skill has at least five evaluation fixtures. The 11 newest packages have eight realistic activation and boundary cases each (88 in total). Fixtures are test inputs, **not benchmark results**: they do not prove a model follows the skill. Behavioral evaluation must record model, host, evaluator, date, test set, and scoring method.

Run checks:

```bash
python scripts/validate_skills.py
python -m unittest discover -s tests -v
```

## Documentation

- [Domain map](docs/domain-map.md)
- [Landscape review](docs/landscape-review.md)
- [Marketplace integration plan](docs/marketplace-integration.md)
- [Host compatibility](docs/host-compatibility.md)
- [Skill quality and lifecycle](docs/skill-quality.md)

## Status and licensing

EXTREMIS is in the library-building stage. All skills remain **draft** until reviewed and behaviorally evaluated. Next priorities are stronger activation evaluation, the Librarian selector/composer, host adapters, package integrity/update handling, and marketplace integration.

A project license has not yet been selected. Do not assume reuse or redistribution rights until a license is added. This must be resolved before broad third-party distribution or marketplace publication.
