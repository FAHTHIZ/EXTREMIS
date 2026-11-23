---
name: agent-orchestration
description: "Use when designing or reviewing an AI agent or multi-agent system: choosing between a single agent, workflows and subagents, defining tools and their permissions, memory and context strategy, handoffs, stopping rules, human approval points and evaluation."
license: Apache-2.0
metadata:
  extremis.domain: ai-engineering
  extremis.version: "0.1.0"
---

# Agent Orchestration

## Mission

Design agents and multi-agent systems with scoped tools, handoffs, guardrails and evals.

## Prerequisites

- the goal the agent serves and who it acts for
- available tools, data and the actions it may take

## Procedure

1. Describe the job as inputs, outputs, the actions the agent may take and who approves them. Prefer a fixed workflow when the steps are known; use an agent only where the path depends on what it finds.
2. Choose the shape: one agent with tools, a workflow of model calls, or an orchestrator with subagents. Use subagents when work is parallel or needs separate context, not by default. Compare options with `decision.weighted_matrix` on cost, latency, reliability and control.
3. Define each tool: name, purpose, input schema, side effects and permission (read, write, network, exec). Give each agent the smallest tool set that does its job.
4. Plan context: what goes in the system prompt, what is retrieved on demand, what is summarized between steps, and what is stored as memory with an expiry.
5. Define handoffs as typed messages (task, inputs, expected output, done criteria) so a subagent can work without the whole conversation.
6. Add control: step and cost budgets, stop conditions, retries with backoff, human approval before irreversible or external actions, and a log of every tool call.
7. Threat-model the tools: untrusted content reaching a model that can act (prompt injection), data leaving through tool calls, and over-broad credentials.
8. Write the system prompts and lint them with `prompt.lint`. Define an evaluation set of tasks with expected outcomes and success criteria before building.

## Output contract

- Architecture: agents, tools, data flow and handoff messages
- Tool table with permissions and side effects
- Control plan: budgets, stop rules, approvals, logging
- Threats and mitigations
- Evaluation plan with task set and success metrics

## Boundaries and stop conditions

- Do not give an agent write, network or exec access it does not need.
- Require human approval for payments, messages to people, deletions and production changes.
- Do not describe an agent as autonomous-safe; describe the controls and their limits.

## Completion rule

Finish only when the requested output is delivered, important assumptions and limitations are visible, and the work has been checked against the output contract. Report what was and was not verified.
