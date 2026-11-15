// Content hashing for capability folders.
//
// computeFolderHash implements the `computedHash` algorithm of the vercel-labs/skills
// lockfile (skills-lock.json v2) so EXTREMIS lock entries are comparable across tools:
// every file except metadata.json, .git, __pycache__ and __pypackages__; text files
// (no NUL byte) have CRLF normalized to LF; entries sorted by UTF-8 path bytes; SHA-256
// over `path \0 byteLength \0 content` for each file.

import { createHash } from 'node:crypto';
import { readdir, readFile, lstat } from 'node:fs/promises';
import path from 'node:path';

const EXCLUDED_DIRS = new Set(['.git', '__pycache__', '__pypackages__']);
const EXCLUDED_FILES = new Set(['metadata.json']);

export async function listFiles(root) {
  const files = [];
  async function walk(dir, rel) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = rel ? `${rel}/${entry.name}` : entry.name;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        await walk(full, relPath);
      } else if (entry.isFile()) {
        if (EXCLUDED_FILES.has(entry.name)) continue;
        files.push(relPath);
      } else if (entry.isSymbolicLink()) {
        files.push(relPath); // reported by the scanner; hashed as the link text
      }
    }
  }
  await walk(root, '');
  return files.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
}

export function normalizeContent(buffer) {
  if (buffer.includes(0)) return buffer;
  return Buffer.from(buffer.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
}

export function hashEntries(entries) {
  const hash = createHash('sha256');
  const sorted = [...entries].sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  for (const { path: p, content } of sorted) {
    const body = normalizeContent(Buffer.from(content));
    hash.update(p);
    hash.update('\0');
    hash.update(String(body.length));
    hash.update('\0');
    hash.update(body);
  }
  return hash.digest('hex');
}

export async function computeFolderHash(root) {
  const files = await listFiles(root);
  const entries = [];
  for (const rel of files) {
    const full = path.join(root, ...rel.split('/'));
    const info = await lstat(full);
    const content = info.isSymbolicLink() ? Buffer.from('symlink') : await readFile(full);
    entries.push({ path: rel, content });
  }
  return hashEntries(entries);
}

export function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}
