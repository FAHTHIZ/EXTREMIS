#!/usr/bin/env node
// SessionStart hook for the EXTREMIS Claude Code plugin.
// Adds a short reminder (about 100 tokens) so the agent plans with EXTREMIS before
// non-trivial work. The full gateway instructions stay in skills/extremis and load on demand.
// Set EXTREMIS_SESSION_HOOK=off to disable.

const off = /^(0|off|false|no)$/i.test(process.env.EXTREMIS_SESSION_HOOK ?? '');

export const SESSION_CONTEXT = [
  'EXTREMIS is available through the extremis MCP server (59 capabilities, 41 permission-gated tools).',
  'For any multi-step task: call extremis_plan with the task, extremis_activate the selected capabilities,',
  'use extremis_run for deterministic steps (parsing, profiling, scanning), and call extremis_verify before reporting the task done.',
  'Skip EXTREMIS for one-line answers. The extremis skill has the full protocol.'
].join(' ');

if (!off) {
  process.stdout.write(`${JSON.stringify({
    hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: SESSION_CONTEXT }
  })}\n`);
}
