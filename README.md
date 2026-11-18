# Body Mechanics

An exercise app for the Linux desktop and Android: start a session by typing what you're doing, log sets, holds and left/right work, and keep your records as encrypted files in a git repository you own.

Planning lives in this repository's issues (gh-project): requirements, decisions D1–D3 and the tasks of each milestone. See `CLAUDE.md` for how they're worked.

## Layout

- `packages/engine`: the app's logic in TypeScript, with no Node or browser imports (D2, #16)
- `packages/app`: the UI (Vite + React), run in the Tauri webview
- `src-tauri`: the Tauri 2 host for desktop and Android
- `scripts/android-build.sh`: builds the APK where the Android SDK, NDK and Java are given (CI)

## Develop

```sh
npm ci
npm run check && npm test
npx tauri dev           # the desktop app with live reload
npx tauri build         # a release build and .deb
BM_SMOKE=1 src-tauri/target/release/body-mechanics   # renders, reports and exits
```

Android builds run in CI (the `android` job) and are uploaded as the `android-apk` artifact.
