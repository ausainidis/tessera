// Stable identifiers for lessons, blocks, choices and assets.
// Identifiers are generated once and never derived from position or title,
// so they survive reordering, renaming, moving the project and re-importing.

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/**
 * @param {string} prefix short type prefix, e.g. "lsn", "blk", "ast"
 * @returns {string} e.g. "blk_k3j9x0a1qz7m"
 */
export function newId(prefix) {
  const bytes = new Uint8Array(12);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return `${prefix}_${out}`;
}

export const ID_PATTERN = /^[a-z]{2,8}_[a-z0-9_-]{4,64}$/i;

export function isValidId(id) {
  return typeof id === 'string' && ID_PATTERN.test(id);
}
