# Capability discovery and planning

## Purpose

EXTREMIS discovery selects relevant capabilities and proposes a compact task plan. It is retrieval and composition infrastructure—not an autonomous agent, a substitute for model reasoning, or permission to execute the selected instructions.

The host remains responsible for reasoning, user approval, tool access, execution decisions, and the final verification report.

## Current architecture

The Node.js implementation is built around one shared service:

1. **Load the catalog.** The catalog loader discovers capability directories containing `SKILL.md` and optional `capability.json` manifests. The default precedence is project-installed, user-installed, `EXTREMIS_PATH`, then built-in capabilities.
2. **Normalize metadata.** Frontmatter and optional manifests become a consistent capability record: name, summary, domain, keywords, intents, `not_for` boundaries, prerequisites, dependencies, tools, permissions, risk, maturity, workflows, and verification checks.
3. **Build an in-memory index.** `src/search.mjs` indexes separate fields for name, keywords, summary, intents, description, tools, domain, and the complete instruction body.
4. **Expand and rank queries.** The search engine uses field-weighted BM25F, conservative synonym expansion, a coordination factor, and a penalty for terms that overlap authored `not_for` boundaries. Deterministic lexical retrieval is the default; a host may provide an optional reranker.
5. **Compose a plan.** `src/plan.mjs` prefers a clearly matching workflow where appropriate. Otherwise it uses coverage-greedy selection, resolves required dependencies, orders capabilities by phase, and merges verification checks.
6. **Activate progressively.** Hosts can load compact discovery cards first, full instructions and tool schemas at activation, and individual resources only when needed.

## Retrieval behavior

The field weights are explicit in `src/search.mjs`. Capability names and keywords receive the strongest weights; summary, intent, and description fields provide additional task context; full instructions remain searchable at a lower per-field weight.

The `not_for` field is negative retrieval evidence. It helps suppress common near-miss activations, but it is authored guidance—not an authorization rule or a safety boundary. Hosts should inspect the matched terms and selected capability scope before execution.

Scores and confidence labels are retrieval signals. They are not calibrated probabilities, model confidence, quality scores, or evidence that an agent can complete the task.

## CLI

Search the catalog:

```bash
npx extremis search "review a TypeScript repository"
npx extremis search "prepare a data migration" --domain software-engineering
npx extremis search "analyze a customer survey" --json
```

Compose a task plan:

```bash
npx extremis plan "audit a Node.js API for reliability and security"
npx extremis plan "analyze sales data and verify the results" --json
```

Inspect and activate selected capabilities:

```bash
npx extremis list
npx extremis show repository-audit
npx extremis activate repository-audit debugging
```

Run the deterministic routing evaluation:

```bash
npm run eval
npx extremis eval --json
npx extremis eval --misses
```

## JavaScript interface

The SDK and MCP server call the same service layer used by the CLI:

```js
import { createExtremis } from "extremis";

const extremis = createExtremis({
  cwd: process.cwd(),
  allow: ["read"]
});

const matches = await extremis.search("review a TypeScript repository");
const plan = await extremis.plan("audit a Node.js API");
const activated = await extremis.activate(
  plan.capabilities.map((item) => item.name)
);
```

The service exposes search, planning, activation, resource reads, tool discovery/execution, verification, diagnostics, and statistics. The host still decides whether to accept a plan and execute any tool.

## Evaluation

The CLI evaluation reports authored fixture performance and a separate routing holdout set. It measures:

- **Hit@1:** expected capability appears first for positive cases.
- **Hit@K:** expected capability appears within the top K.
- **MRR:** mean reciprocal rank of the expected capability.
- **False activation:** unrelated capabilities appear for negative cases.
- **Catalog context size:** an estimate of the tokens represented by capability cards.

Fixtures are test inputs, not model-behavior results. They do not prove that a model follows instructions, that a capability improves task outcomes, or that a host integration works. Behavioral evaluation must record the model, host, evaluator, dataset, date, and scoring procedure.

## Known limitations

- Lexical matching can miss paraphrases, multilingual queries, and concepts expressed with unfamiliar vocabulary.
- Synonym expansion and `not_for` penalties are hand-maintained heuristics; they can help or hurt depending on task context.
- BM25F does not understand task intent in the way a reasoning model does.
- Coverage-greedy composition is a deterministic heuristic, not an optimal plan solver.
- Dependency closure and phase ordering use declared metadata. Incorrect manifests can produce poor plans.
- A workflow match is only a candidate plan. The host must inspect its steps, required capabilities, tools, permissions, and verification checks.
- The evaluator does not run agent hosts or measure end-to-end task success.
- Scores should not be compared across catalogue snapshots or weight configurations without a controlled evaluation.

## Next architecture steps

1. Maintain a human-reviewed holdout set that covers more languages, task families, and difficult near-misses.
2. Add semantic retrieval or reranking only behind the existing optional interface and compare it to the lexical baseline.
3. Evaluate the same tasks across real MCP hosts and SDK consumers.
4. Add behavioral evaluations in isolated environments, with explicit permissions and reproducible model/host metadata.
5. Use evaluation failures to improve metadata, scope boundaries, dependencies, and workflows—not merely to increase catalog size.

## Safety and trust boundary

Capability instructions are untrusted content. Discovery treats them as text and metadata; it does not run scripts or grant permissions. Activation returns content and declared tool information. The runner independently validates inputs and checks permissions, while the host remains responsible for user approval and execution policy.
