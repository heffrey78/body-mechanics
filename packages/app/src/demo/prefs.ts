/**
 * Whether demonstrations are drawn with 3D graphics (WebGL) or with the plain canvas drawing (#80).
 * Kept per device, in the webview's storage: it is about this device's graphics, not the person's records.
 *
 * On Android the default is the drawing. On the owner's Pixel 10 Pro the WebView's graphics driver
 * resets when the app comes back from another app; a live WebGL context is lost in it, Chromium then
 * blocks the page from 3D until it reloads, and its graphics thread has crashed the app outright.
 */
const KEY = "bm.demo3d";

export const ON_ANDROID = /Android/i.test(navigator.userAgent);

export function use3d(): boolean {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "on" || v === "off") return v === "on";
  } catch { /* storage unavailable: the default */ }
  return !ON_ANDROID;
}

export function setUse3d(on: boolean): void {
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch { /* not kept */ }
}
