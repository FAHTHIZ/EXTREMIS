// Built-in tool registry. Tool modules are plain arrays of definitions:
// { id, title, description, permissions, input_schema, run(input, ctx) }.

import data from './data.mjs';
import code from './code.mjs';
import security from './security.mjs';
import analysis from './analysis.mjs';
import docs from './docs.mjs';
import web from './web.mjs';
import api from './api.mjs';
import ai from './ai.mjs';

const MODULES = [data, code, security, analysis, docs, web, api, ai];
const TOOLS = new Map();
for (const list of MODULES) for (const tool of list) {
  if (TOOLS.has(tool.id)) throw new Error(`duplicate built-in tool id ${tool.id}`);
  TOOLS.set(tool.id, Object.freeze(tool));
}

export function getBuiltinTool(id) { return TOOLS.get(id) || null; }
export function listBuiltinTools() { return [...TOOLS.values()]; }

/** Public description of a tool (no run function), used by activation and schema export. */
export function describeTool(tool) {
  return { id: tool.id, title: tool.title, description: tool.description, permissions: tool.permissions, input_schema: tool.input_schema };
}
