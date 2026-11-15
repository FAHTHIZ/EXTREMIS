// Export tool definitions for function-calling APIs. Tool ids contain dots
// (data.profile), which most APIs reject, so names become data__profile; use
// toolIdFromName() to map a call back to an id.

import { GATEWAY_TOOLS } from './mcp.mjs';

export const SCHEMA_FORMATS = ['json', 'openai', 'openai-responses', 'anthropic', 'mcp', 'gemini'];

export function toolName(id) { return id.replace(/\./g, '__'); }
export function toolIdFromName(name) { return name.replace(/__/g, '.'); }

/** Inline local $ref/$defs so schemas work with APIs that do not resolve references. */
export function inlineRefs(schema) {
  const defs = schema?.$defs || schema?.definitions || {};
  const walk = (node, depth = 0) => {
    if (Array.isArray(node)) return node.map((n) => walk(n, depth));
    if (!node || typeof node !== 'object') return node;
    if (typeof node.$ref === 'string' && depth < 20) {
      const m = /^#\/(\$defs|definitions)\/(.+)$/.exec(node.$ref);
      if (m && defs[m[2]]) { const { $ref, ...rest } = node; return walk({ ...defs[m[2]], ...rest }, depth + 1); }
    }
    const out = {};
    for (const [k, v] of Object.entries(node)) if (k !== '$defs' && k !== 'definitions' && k !== '$schema') out[k] = walk(v, depth);
    return out;
  };
  return walk(schema);
}

function normalize(tool) {
  if (tool.inputSchema) return { name: tool.name, description: tool.description, schema: tool.inputSchema };
  return { name: toolName(tool.id), description: tool.description, schema: tool.input_schema || { type: 'object' } };
}

export function exportSchemas(tools, format = 'json', { gateway = false } = {}) {
  const list = (gateway ? GATEWAY_TOOLS : tools).map(normalize).map((t) => ({ ...t, schema: inlineRefs(t.schema) }));
  switch (format) {
    case 'openai': return list.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.schema } }));
    case 'openai-responses': return list.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.schema }));
    case 'anthropic': return list.map((t) => ({ name: t.name, description: t.description, input_schema: t.schema }));
    case 'mcp': return list.map((t) => ({ name: t.name, description: t.description, inputSchema: t.schema }));
    case 'gemini': return [{ functionDeclarations: list.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.schema })) }];
    case 'json': return gateway ? GATEWAY_TOOLS : tools;
    default: throw new Error(`unknown schema format ${format}`);
  }
}
