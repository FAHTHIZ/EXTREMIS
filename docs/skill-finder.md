# Skill finder

`extremis find` answers one question: is there a public Agent Skill that does this task, and is it safe to install? It searches several directories at once, reads the strongest candidates, scans them, and ranks them against the task you typed.

~~~bash
npx extremis find "review a terraform module"
npx extremis find "extract tables from scanned pdf invoices" --official
npx extremis find "playwright e2e tests" --install 1 --project
~~~

## Sources

| Source | What is searched | Needs |
|---|---|---|
| `local` | The installed EXTREMIS catalog (built-in, user and project capabilities). Shown first as "Already available" | nothing |
| `skills.sh` | The [skills.sh](https://skills.sh) directory used by `npx skills find`: skill names, sources and install counts | network |
| `github` | Repositories tagged `agent-skills`, and `SKILL.md` files through GitHub code search | network; code search needs `GITHUB_TOKEN` or `GH_TOKEN` |
| `index` | Agent Skills discovery indexes ([v0.2.0 schema](https://schemas.agentskills.io/discovery/0.2.0/schema.json)) at `/.well-known/agent-skills/index.json`, passed with `--index <url>` or `EXTREMIS_FIND_INDEXES` | network |

Pick sources with `--source local,skills.sh` (repeatable or comma-separated). A source that fails or times out adds a note and the search continues with the others.

## Ranking

1. **Query planning.** The task is reduced to keywords, then sent as several short queries: the keywords together when there are three or fewer, adjacent keyword pairs, and single keywords. Filler ("I need a skill to…") is dropped.
2. **Merge.** Candidates are keyed by `owner/repo/skill`. A skill returned by several queries or sources gets a retrieval bonus.
3. **First pass.** BM25 over the candidate names plus directory signals picks the top candidates to read (default 12, `--inspect` in the SDK).
4. **Read.** For each of them EXTREMIS downloads the skill snapshot from skills.sh (all files) or the raw `SKILL.md` from GitHub, and parses its frontmatter.
5. **Scan.** The files go through the same static scanner as `extremis install`. The verdict (`safe`, `caution`, `dangerous`) and the top findings are shown. Dangerous skills keep 30% of their score, cautioned ones 85%.
6. **Final rank.** The score combines:

| Signal | Weight |
|---|---:|
| BM25F relevance on name (×3), description (×2) and body (×0.6), with EXTREMIS synonyms | 0.42 |
| Coverage: share of your specific terms the skill matches | 0.20 |
| Directory retrieval rank across the planned queries | 0.15 |
| Popularity: log of installs (or stars), multiplied by coverage | 0.13 |
| Official publisher (vendor-maintained, for example `anthropics`, `vercel-labs`, `cloudflare`, `microsoft`) | 0.06 |
| Found by more than one source | up to 0.04 |

Generic task verbs (write, build, review, fix…) count at low weight so they cannot carry an unrelated skill. Popularity is scaled by coverage, so a skill with hundreds of thousands of installs does not outrank a relevant one with a hundred.

Each result has a confidence: `high` when it was read and covers most of your terms, `medium` when it covers at least a third, otherwise `low`.

## Installing a result

Each result carries the install command, for example `extremis install cloudflare/skills --skill nextjs-on-cloudflare`. `--install [rank]` runs it for you through the normal install path, which clones the source, scans it again on disk, refuses dangerous packages and records the commit and content hash in the lockfile. `--project` installs into the current project instead of `~/.extremis`.

## Agents and SDKs

- MCP: the `extremis_find` gateway tool (`readOnlyHint: true`, `openWorldHint: true`). `extremis_plan` adds a `discover` hint pointing at it when local confidence is not high. The gateway skill tells the agent to show the best result to the user and install only with approval.
- JavaScript: `await new Extremis().find(task, { limit, sources, indexes, owner, officialOnly, minInstalls, deep })`, or the standalone `find()` export.
- Python: `ExtremisClient().find(task, official_only=True)`.

## Privacy, caching and limits

- The query text is sent to skills.sh and GitHub. `EXTREMIS_OFFLINE=1` (or `--offline`) restricts the search to the local catalog.
- User-supplied index URLs and a custom `EXTREMIS_SKILLS_API` go through the same public-address check as network tools; private and loopback hosts are refused.
- Responses are cached for six hours under `~/.extremis/cache/find` (`EXTREMIS_HOME` moves it; `--no-cache` bypasses it).
- Unauthenticated GitHub search allows about 10 requests a minute; a finder run uses one or two.
- Static scanning is heuristic. A `safe` verdict means no known pattern matched, not that the skill was audited. Read a third-party skill before giving it `write`, `network` or `exec`.
