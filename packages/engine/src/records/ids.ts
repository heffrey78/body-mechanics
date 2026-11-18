/** Record and set ids: 16 characters of lowercase base32, random. Opaque, so file names reveal nothing (D2). */

const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

export const ID_PATTERN = /^[a-z2-7]{16}$/;

export function newId(random: (bytes: Uint8Array) => Uint8Array = (b) => crypto.getRandomValues(b)): string {
  const bytes = random(new Uint8Array(16));
  let id = "";
  for (const b of bytes) id += ALPHABET[b % 32];
  return id;
}
