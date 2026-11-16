import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, symlinkSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createContext } from '../src/runner.mjs';
import { install } from '../src/install.mjs';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'extremis-regression-'));

test('built-in writes reject symlinked parent directories and still create safe nested paths', async (t) => {
  const root = tmp();
  const outside = tmp();
  const link = path.join(root, 'linked');
  try {
    symlinkSync(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
  } catch (error) {
    t.skip(`symlink creation is unavailable in this environment: ${error.message}`);
    return;
  }

  const ctx = createContext({ cwd: root, root, allow: ['write'] });
  await assert.rejects(ctx.writeFile('linked/escape.txt', 'not allowed'), /symbolic link|outside the workspace/i);
  assert.equal(existsSync(path.join(outside, 'escape.txt')), false);

  await ctx.writeFile('safe/nested/result.txt', 'written');
  assert.equal(existsSync(path.join(root, 'safe', 'nested', 'result.txt')), true);
});

test('installer refuses a redirect to a non-HTTP(S) scheme', async () => {
  let requests = 0;
  const env = {
    ...process.env,
    EXTREMIS_HOME: tmp(),
    EXTREMIS_ALLOW_PRIVATE_NETWORK: '1',
  };
  await assert.rejects(
    install('https://example.invalid/capability/SKILL.md', {
      env,
      fetchImpl: async (_url, options) => {
        requests += 1;
        assert.equal(options.redirect, 'manual');
        return new Response(null, {
          status: 302,
          headers: { location: 'file:///etc/passwd' },
        });
      },
    }),
    /unsupported protocol|redirect/i,
  );
  assert.equal(requests, 1);
});
