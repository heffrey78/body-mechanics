/**
 * The person's repository of records, encrypted (D2, #25). `create` sets one up on the first device:
 * a plain format.yaml, a new age identity kept in the device's secrets, and its copy wrapped with the
 * person's passphrase at keys/identity.age; it returns the recovery key, shown once. `join` opens a
 * cloned repository on another device with the passphrase. Every record is written encrypted and
 * read decrypted here: plaintext never reaches the repository.
 */
import type { FilesPort } from "../ports/files-port.ts";
import type { SecretsPort } from "../ports/secrets-port.ts";
import { FORMAT_FILE, IDENTITY_FILE, recordPath } from "../records/paths.ts";
import { FORMAT_VERSION, type AnyRecord } from "../records/schemas.ts";
import { parseFormat, parseRecord, serializeFormat, serializeRecord } from "../records/yaml.ts";
import { isSealed, newIdentity, open, recipientOf, seal, unwrapIdentity, wrapIdentity } from "./crypto.ts";

/**
 * scrypt's work factor for the passphrase-wrapped identity: 2^16 (64 MB), which a phone's webview can
 * afford; age's own default, 2^18, needs 256 MB there. Only setting up and joining pay it.
 */
export const SCRYPT_LOG_N = 16;

/** Where the device keeps the identity, by repository folder: one person, one repository per device. */
export const IDENTITY_SECRET = "age-identity";

export class NotSetUp extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotSetUp";
  }
}

export interface VaultPorts {
  files: FilesPort;
  secrets: SecretsPort;
}

export class Vault {
  readonly root: string;
  readonly #files: FilesPort;
  readonly #identity: string;
  readonly #recipient: string;

  private constructor(files: FilesPort, root: string, identity: string, recipient: string) {
    this.#files = files;
    this.root = root;
    this.#identity = identity;
    this.#recipient = recipient;
  }

  /** A new repository at `root` (an empty folder): returns the vault and the recovery key to show once. */
  static async create(ports: VaultPorts, root: string, passphrase: string, options: { scryptLogN?: number } = {}): Promise<{ vault: Vault; recoveryKey: string }> {
    const { files, secrets } = ports;
    if (passphrase.length < 8) throw new Error("Use a passphrase of at least 8 characters.");
    if (await files.stat(files.join(root, FORMAT_FILE))) throw new Error("There's already a repository here.");
    const identity = await newIdentity();
    await files.makeDir(root);
    await files.write(files.join(root, FORMAT_FILE), serializeFormat({
      format: "body-mechanics", version: FORMAT_VERSION, encryption: { scheme: "age-x25519", identity: IDENTITY_FILE },
    }));
    await files.write(files.join(root, ...IDENTITY_FILE.split("/")), await wrapIdentity(identity, passphrase, options.scryptLogN ?? SCRYPT_LOG_N));
    await secrets.set(IDENTITY_SECRET, identity);
    return { vault: new Vault(files, root, identity, await recipientOf(identity)), recoveryKey: identity };
  }

  /** A repository cloned from another device, opened with the passphrase (or the recovery key). */
  static async join(ports: VaultPorts, root: string, passphraseOrRecoveryKey: string): Promise<Vault> {
    const { files, secrets } = ports;
    await Vault.#format(files, root);
    let identity: string;
    if (passphraseOrRecoveryKey.startsWith("AGE-SECRET-KEY-1")) {
      identity = passphraseOrRecoveryKey.trim();
    } else {
      const wrapped = await files.read(files.join(root, ...IDENTITY_FILE.split("/")));
      if (!wrapped) throw new NotSetUp("This repository has no keys/identity.age.");
      identity = await unwrapIdentity(wrapped, passphraseOrRecoveryKey);
    }
    await secrets.set(IDENTITY_SECRET, identity);
    return new Vault(files, root, identity, await recipientOf(identity));
  }

  /** The repository this device has already set up or joined. */
  static async open(ports: VaultPorts, root: string): Promise<Vault> {
    const { files, secrets } = ports;
    await Vault.#format(files, root);
    const identity = await secrets.get(IDENTITY_SECRET);
    if (!identity) throw new NotSetUp("This device hasn't joined the repository yet: it needs the passphrase.");
    return new Vault(files, root, identity, await recipientOf(identity));
  }

  static async #format(files: FilesPort, root: string): Promise<void> {
    const text = await files.read(files.join(root, FORMAT_FILE));
    if (!text) throw new NotSetUp("No Body Mechanics repository here (no format.yaml).");
    parseFormat(new TextDecoder().decode(text));
  }

  /** Writes a record, encrypted, at its place (D2); returns its path from the repository's root. */
  async write(record: AnyRecord): Promise<string> {
    const path = recordPath(record);
    await this.#files.write(this.#files.join(this.root, ...path.split("/")), await seal(this.#recipient, serializeRecord(record)));
    return path;
  }

  /** A record by its path from the root, decrypted and checked; undefined if there's no file. */
  async read(path: string): Promise<AnyRecord | undefined> {
    const bytes = await this.#files.read(this.#files.join(this.root, ...path.split("/")));
    if (!bytes) return undefined;
    if (!isSealed(bytes)) throw new Error(`${path} isn't encrypted: refusing to read a plaintext record.`);
    return parseRecord(new TextDecoder().decode(await open(this.#identity, bytes)));
  }

  /** Every record file's path under `dir` (e.g. "sessions"), from the root. */
  async list(dir = ""): Promise<string[]> {
    const base = dir ? this.#files.join(this.root, ...dir.split("/")) : this.root;
    const entries = await this.#files.list(base, { recursive: true });
    return entries
      .filter((e) => e.kind === "file" && e.path.endsWith(".yaml.age"))
      .map((e) => (dir ? `${dir}/${e.path}` : e.path))
      .sort();
  }
}
