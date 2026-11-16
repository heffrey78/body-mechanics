/**
 * The web-standard globals the engine may use: every host it runs in has them (the Tauri webview,
 * Node 22+ in tests). Declared here, not with the DOM's types, so the engine can't reach for
 * `window` or `document` by accident (D2).
 */
declare class TextEncoder {
  encode(input?: string): Uint8Array;
}
declare class TextDecoder {
  constructor(label?: string, options?: { fatal?: boolean });
  decode(input?: Uint8Array): string;
}
declare class AbortSignal {
  readonly aborted: boolean;
  addEventListener(type: "abort", listener: () => void, options?: { once?: boolean }): void;
}
declare function atob(data: string): string;
declare function btoa(data: string): string;
declare const crypto: { getRandomValues<T extends Uint8Array>(array: T): T };
