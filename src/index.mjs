// EXTREMIS JavaScript SDK.
//
//   import { createExtremis } from 'extremis';
//   const x = createExtremis({ cwd: process.cwd(), allow: ['read'] });
//   const plan = await x.plan('profile sales.csv and chart revenue by month');
//   const ctx = await x.activate(plan.capabilities.map((c) => c.name));
//   const result = await x.run('data.profile', { path: 'sales.csv' });
//   const checks = await x.verify({ capability: 'data-analysis', params: { dataset: 'sales.csv' } });

export { Extremis, createExtremis, VERSION } from './service.mjs';
export { loadCatalog, loadCapability, defaultRoots, extremisHome, listResources, Catalog, BUILTIN_DIR, PACKAGE_ROOT } from './catalog.mjs';
export { buildIndex, search, FIELD_WEIGHTS } from './search.mjs';
export { resolve, resolveStrict, ResolutionError } from './resolve.mjs';
export { activate, readResource, card, capabilityTools, capabilityPermissions, digestOf, ActivationError } from './activate.mjs';
export { plan, PHASES } from './plan.mjs';
export { runChecks, match, getPath } from './verify.mjs';
export { runTool, resolveTool, createContext, parseAllow, assertPublicUrl, ToolError, PERMISSIONS, DEFAULT_ALLOW } from './runner.mjs';
export { getBuiltinTool, listBuiltinTools, describeTool } from './tools/index.mjs';
export { McpServer, serveStdio, GATEWAY_TOOLS, SUPPORTED_VERSIONS } from './mcp.mjs';
export { exportSchemas, inlineRefs, toolName, toolIdFromName, SCHEMA_FORMATS } from './schemas.mjs';
export { parseSkillDocument, parseYamlSubset, FrontmatterError } from './frontmatter.mjs';
export { lintCapabilities } from './lint.mjs';
export { computeFolderHash } from './hash.mjs';
export { install, update, remove, verifyLock, listInstalled, parseSource, installScope, readLock, InstallError, LOCK_FILE } from './install.mjs';
export { scanDirectory, scanFiles, scanText, verdictOf } from './scan.mjs';
export { unpackArchive, ArchiveError } from './archive.mjs';
