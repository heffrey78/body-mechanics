/**
 * The secrets port (#25): small strings the device keeps safe, here the age identity that decrypts
 * the person's records. On the desktop the OS keychain; on Android a file sealed by a key in Android's
 * keystore (as writer keeps its GitHub token); in tests, memory.
 */
export interface SecretsPort {
  get(name: string): Promise<string | undefined>;
  set(name: string, value: string): Promise<void>;
  delete(name: string): Promise<void>;
}

export function memorySecretsPort(seed: Record<string, string> = {}): SecretsPort & { values: Map<string, string> } {
  const values = new Map(Object.entries(seed));
  return {
    values,
    get: async (name) => values.get(name),
    set: async (name, value) => void values.set(name, value),
    delete: async (name) => void values.delete(name),
  };
}
