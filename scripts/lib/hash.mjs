import { createHash } from 'node:crypto';
import fs from 'node:fs';

// Returns 0x-prefixed SHA-256 of a buffer or string.
export function sha256Hex(data) {
  return '0x' + createHash('sha256').update(data).digest('hex');
}

// Returns 0x-prefixed SHA-256 of a file's bytes.
export function sha256File(path) {
  return sha256Hex(fs.readFileSync(path));
}

// Serializes JSON with sorted object keys so hashes are reproducible.
export function canonicalJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

// SHA-256 of the canonical JSON form of a value.
export function hashJson(value) {
  return sha256Hex(canonicalJson(value));
}

// Binary SHA-256 Merkle root over hex leaves; an odd node is paired with itself.
export function merkleRoot(leaves) {
  if (leaves.length === 0) throw new Error('merkleRoot: no leaves');
  let level = leaves.map((h) => Buffer.from(h.replace(/^0x/, ''), 'hex'));
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) {
      const right = level[i + 1] ?? level[i];
      next.push(createHash('sha256').update(Buffer.concat([level[i], right])).digest());
    }
    level = next;
  }
  return '0x' + level[0].toString('hex');
}
