// CLI commands that live outside the core command switch (schema export now;
// installer, scanner, export and build register here as they are implemented).

import { exportSchemas, SCHEMA_FORMATS } from './schemas.mjs';

export const commands = {
  async schema({ args, flags, service, json }) {
    const format = args[0] || 'json';
    if (!SCHEMA_FORMATS.includes(format)) throw new Error(`format must be one of ${SCHEMA_FORMATS.join(', ')}`);
    const tools = flags.capability ? await service.tools({ capability: flags.capability }) : await service.tools();
    json(exportSchemas(tools, format, { gateway: flags.gateway }));
    return 0;
  },
};
