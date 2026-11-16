/// <reference lib="webworker" />
import { decryptRecords } from "@bm/engine";

/** One worker of the decrypt pool (#28): the engine's own decryptRecords on a share of the files. */
self.onmessage = async (e: MessageEvent<{ id: number; identity: string; items: { path: string; bytes: Uint8Array }[] }>) => {
  const { id, identity, items } = e.data;
  const { records, failed } = await decryptRecords(identity, items);
  self.postMessage({ id, records: [...records], failed: [...failed] });
};
