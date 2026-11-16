import type { Vault } from "../vault/vault.ts";

/**
 * The set being logged, before it's a set (#28): kept in .local/, encrypted, on every change, so
 * Android killing the app loses nothing. Cleared once the set is written into its session.
 */
export interface Draft {
  sessionId: string;
  entryId?: string;
  /** Whatever the logging screen needs to put the set back as it was (#32 decides its shape). */
  state: Record<string, unknown>;
  savedAt: string;
}

const NAME = "draft.json.age";

export const saveDraft = (vault: Vault, draft: Draft) => vault.writeLocal(NAME, draft);
export const loadDraft = (vault: Vault) => vault.readLocal<Draft>(NAME);
export const clearDraft = (vault: Vault) => vault.removeLocal(NAME);
