// Safe archive unpacking for skill distribution (.tar.gz, .tgz, .tar, .zip).
//
// Implements the unpacking rules of the Agent Skills well-known discovery RFC:
// no absolute paths or `..` segments, no links that resolve outside the skill
// directory, and a total unpacked-size limit against decompression bombs.
// Links that stay inside the archive are materialised as copies of their target
// so installed capabilities never contain symlinks.

import { gunzipSync } from 'node:zlib';
import { readZip } from './tools/util.mjs';

export class ArchiveError extends Error {
  constructor(message) { super(message); this.name = 'ArchiveError'; this.code = 'invalid_archive'; }
}

export const ARCHIVE_LIMITS = { maxEntries: 5000, maxTotal: 50 * 1024 * 1024, maxFile: 20 * 1024 * 1024 };

/** Normalise an archive member path; throws on traversal or absolute paths. */
export function safeMemberPath(raw) {
  const name = String(raw).replace(/\\/g, '/');
  if (!name || name.startsWith('/') || /^[a-zA-Z]:/.test(name)) throw new ArchiveError(`absolute path in archive: ${raw}`);
  const parts = [];
  for (const part of name.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') throw new ArchiveError(`path traversal in archive: ${raw}`);
    if (part.includes('\0')) throw new ArchiveError(`NUL byte in archive path: ${raw}`);
    parts.push(part);
  }
  return parts.join('/');
}

function resolveLink(from, target) {
  if (target.startsWith('/')) return null;
  const parts = from.split('/').slice(0, -1);
  for (const part of target.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') { if (!parts.length) return null; parts.pop(); } else parts.push(part);
  }
  return parts.join('/');
}

function octal(buf, start, len) {
  const text = buf.toString('latin1', start, start + len).replace(/\0.*$/s, '').trim();
  if (buf[start] & 0x80) { // GNU base-256 for large sizes
    let value = 0;
    for (let i = start + 1; i < start + len; i += 1) value = value * 256 + buf[i];
    return value;
  }
  return text ? parseInt(text, 8) : 0;
}

function cstr(buf, start, len) {
  const end = buf.indexOf(0, start);
  return buf.toString('utf8', start, end >= 0 && end < start + len ? end : start + len);
}

function parsePax(text) {
  const out = {};
  let i = 0;
  while (i < text.length) {
    const space = text.indexOf(' ', i);
    if (space < 0) break;
    const len = parseInt(text.slice(i, space), 10);
    if (!len) break;
    const record = text.slice(space + 1, i + len - 1);
    const eq = record.indexOf('=');
    if (eq > 0) out[record.slice(0, eq)] = record.slice(eq + 1);
    i += len;
  }
  return out;
}

/** Parse a tar buffer into raw members [{name, type: 'file'|'dir'|'symlink'|'hardlink', data, link}]. */
export function readTar(buffer, limits = ARCHIVE_LIMITS) {
  const members = [];
  let offset = 0;
  let pax = {};
  let longName = null;
  let longLink = null;
  let total = 0;
  while (offset + 512 <= buffer.length) {
    const header = buffer.subarray(offset, offset + 512);
    if (header.every((b) => b === 0)) break;
    const size = octal(header, 124, 12);
    const type = String.fromCharCode(header[156] || 48);
    const dataStart = offset + 512;
    const data = buffer.subarray(dataStart, dataStart + size);
    if (data.length < size) throw new ArchiveError('truncated tar archive');
    offset = dataStart + Math.ceil(size / 512) * 512;
    if (type === 'x') { pax = parsePax(data.toString('utf8')); continue; }
    if (type === 'g') continue;
    if (type === 'L') { longName = cstr(data, 0, data.length); continue; }
    if (type === 'K') { longLink = cstr(data, 0, data.length); continue; }
    const prefix = header.toString('latin1', 257, 262) === 'ustar' ? cstr(header, 345, 155) : '';
    let name = pax.path || longName || (prefix ? `${prefix}/${cstr(header, 0, 100)}` : cstr(header, 0, 100));
    const link = pax.linkpath || longLink || cstr(header, 157, 100);
    pax = {}; longName = null; longLink = null;
    if (members.length >= limits.maxEntries) throw new ArchiveError('archive has too many entries');
    if (type === '0' || type === '\0' || type === '7') {
      total += size;
      if (size > limits.maxFile) throw new ArchiveError(`archive member too large: ${name}`);
      if (total > limits.maxTotal) throw new ArchiveError('archive expands beyond the size limit');
      members.push({ name, type: 'file', data: Buffer.from(data) });
    } else if (type === '5') members.push({ name, type: 'dir' });
    else if (type === '2') members.push({ name, type: 'symlink', link });
    else if (type === '1') members.push({ name, type: 'hardlink', link });
    else throw new ArchiveError(`unsupported tar member type "${type}" for ${name}`);
  }
  return members;
}

function zipMembers(buffer, limits) {
  let zip;
  try { zip = readZip(buffer, { maxEntries: limits.maxEntries, maxTotal: limits.maxTotal }); } catch (error) { throw new ArchiveError(error.message); }
  return zip.names.map((name) => {
    const mode = zip.mode(name);
    const data = zip.read(name);
    if (data.length > limits.maxFile) throw new ArchiveError(`archive member too large: ${name}`);
    if ((mode & 0o170000) === 0o120000) return { name, type: 'symlink', link: data.toString('utf8') };
    return { name, type: 'file', data };
  });
}

/** Detect the archive format from content type, file name and magic bytes. */
export function detectFormat(buffer, { contentType = '', filename = '' } = {}) {
  const ct = contentType.toLowerCase();
  if (/gzip|x-gtar|x-tgz/.test(ct)) return 'tar.gz';
  if (/(^|\/|-)zip\b/.test(ct)) return 'zip';
  if (/x-tar/.test(ct)) return 'tar';
  if (/\.zip$/i.test(filename)) return 'zip';
  if (/\.(tar\.gz|tgz)$/i.test(filename)) return 'tar.gz';
  if (/\.tar$/i.test(filename)) return 'tar';
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return 'zip';
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) return 'tar.gz';
  if (buffer.length > 262 && buffer.toString('latin1', 257, 262) === 'ustar') return 'tar';
  throw new ArchiveError('unrecognised archive format (expected .tar.gz or .zip)');
}

/**
 * Unpack an archive into a list of files [{path, data}] rooted at the skill
 * directory. Options: format, contentType, filename, limits, stripWrapper
 * (accept a single top-level wrapper directory, as produced by GitHub tarballs).
 */
export function unpackArchive(buffer, options = {}) {
  const limits = { ...ARCHIVE_LIMITS, ...(options.limits || {}) };
  const format = options.format || detectFormat(buffer, options);
  let members;
  if (format === 'zip') members = zipMembers(buffer, limits);
  else {
    let tar = buffer;
    if (format === 'tar.gz') {
      try { tar = gunzipSync(buffer, { maxOutputLength: limits.maxTotal + 1024 * 1024 }); } catch (error) { throw new ArchiveError(`cannot decompress archive: ${error.message}`); }
    }
    members = readTar(tar, limits);
  }
  const files = new Map();
  const links = [];
  for (const member of members) {
    const name = safeMemberPath(member.name);
    if (!name || member.type === 'dir') continue;
    if (member.type === 'file') files.set(name, member.data);
    else links.push({ name, type: member.type, link: member.link });
  }
  for (const { name, type, link } of links) {
    const target = type === 'hardlink' ? (() => { try { return safeMemberPath(link); } catch { return null; } })() : resolveLink(name, link);
    if (target === null || target === undefined) throw new ArchiveError(`link escapes the skill directory: ${name} -> ${link}`);
    if (!files.has(target)) throw new ArchiveError(`link target is not a file in the archive: ${name} -> ${link}`);
    files.set(name, files.get(target));
  }
  let out = [...files.entries()].map(([p, data]) => ({ path: p, data }));
  if (!files.has('SKILL.md') && options.stripWrapper !== false) {
    const tops = new Set(out.map((f) => f.path.split('/')[0]));
    if (tops.size === 1) {
      const [top] = tops;
      if (files.has(`${top}/SKILL.md`)) out = out.map((f) => ({ path: f.path.slice(top.length + 1), data: f.data }));
    }
  }
  return out;
}
