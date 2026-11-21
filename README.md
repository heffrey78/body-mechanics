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

### Arch Linux

Tauri bundles only a .deb, so `packaging/arch/PKGBUILD` builds the binary from this checkout and
packages it with the desktop entry and icons:

```sh
cd packaging/arch && makepkg -si
```

### Android, locally

The same script CI runs, given the SDK in `~/Android/Sdk` (cmdline-tools, `ndk;28.2.13676358`,
`build-tools;36.1.0`, `platforms;android-36`), Java 17 and `rustup target add aarch64-linux-android`:

```sh
export ANDROID_HOME=~/Android/Sdk NDK_HOME=~/Android/Sdk/ndk/28.2.13676358 JAVA_HOME=/usr/lib/jvm/java-17-openjdk
export BM_ANDROID_DEBUG_KEYSTORE=~/.android/debug.keystore   # the key the phone's install was signed with
scripts/android-build.sh aarch64
~/Android/Sdk/platform-tools/adb install -r "$(find src-tauri/gen/android/app/build/outputs/apk -name '*.apk' | head -n 1)"
```
