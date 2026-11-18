/**
 * age encryption for records (D2 item 2, #25), with typage (`age-encryption`, by age's author): files
 * the `age` command line reads too. X25519 identities; the identity's passphrase-wrapped copy uses
 * age's scrypt recipient.
 */
import { Decrypter, Encrypter, generateX25519Identity, identityToRecipient } from "age-encryption";

/** The header every age file starts with. */
export const AGE_MAGIC = "age-encryption.org/v1";

export class WrongPassphrase extends Error {
  constructor() {
    super("That passphrase doesn't open this repository's key.");
    this.name = "WrongPassphrase";
  }
}

export function newIdentity(): Promise<string> {
  return generateX25519Identity();
}

export function recipientOf(identity: string): Promise<string> {
  return identityToRecipient(identity);
}

export async function seal(recipient: string, plain: Uint8Array | string): Promise<Uint8Array> {
  const e = new Encrypter();
  e.addRecipient(recipient);
  return e.encrypt(plain);
}

export async function open(identity: string, sealed: Uint8Array): Promise<Uint8Array> {
  const d = new Decrypter();
  d.addIdentity(identity);
  return d.decrypt(sealed);
}

/** The identity wrapped with a passphrase (scrypt; `logN` lower only in tests). */
export async function wrapIdentity(identity: string, passphrase: string, logN?: number): Promise<Uint8Array> {
  const e = new Encrypter();
  e.setPassphrase(passphrase);
  if (logN !== undefined) e.setScryptWorkFactor(logN);
  return e.encrypt(identity);
}

export async function unwrapIdentity(wrapped: Uint8Array, passphrase: string): Promise<string> {
  const d = new Decrypter();
  d.addPassphrase(passphrase);
  try {
    return (await d.decrypt(wrapped, "text")).trim();
  } catch {
    throw new WrongPassphrase();
  }
}

export function isSealed(bytes: Uint8Array): boolean {
  return new TextDecoder().decode(bytes.subarray(0, AGE_MAGIC.length)) === AGE_MAGIC;
}
