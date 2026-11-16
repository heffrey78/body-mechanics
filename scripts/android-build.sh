#!/usr/bin/env bash
# Builds the Android APK (#20) where the tools are already given: ANDROID_HOME, NDK_HOME, JAVA_HOME and
# a Rust with the Android target (as on CI, following writer's packages/mobile/build.sh). `target` is
# aarch64 (a phone) or x86_64 (the emulator). The Gradle project is generated, not kept in git.
set -euo pipefail
target="${1:-aarch64}"
cd "$(dirname "${BASH_SOURCE[0]}")/../src-tauri"
: "${ANDROID_HOME:?set ANDROID_HOME}" "${NDK_HOME:?set NDK_HOME}" "${JAVA_HOME:?set JAVA_HOME}"
# OpenSSL's build (git2-port's vendored-openssl) asks for a ranlib named for Android, which isn't on the
# PATH: the NDK's own, for both targets (as writer's packages/mobile/build.sh does).
ndk_bin="$NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin"
export RANLIB_aarch64_linux_android="$ndk_bin/llvm-ranlib" RANLIB_x86_64_linux_android="$ndk_bin/llvm-ranlib"
export AR_aarch64_linux_android="$ndk_bin/llvm-ar" AR_x86_64_linux_android="$ndk_bin/llvm-ar"
[[ -d gen/android ]] || npx tauri android init --ci
gradle=gen/android/app/build.gradle.kts
# Android 8 (API 26) at least, as tauri.conf.json says.
sed -i -E 's/minSdk = [0-9]+/minSdk = 26/' "$gradle"
# The owner's debug key where BM_ANDROID_DEBUG_KEYSTORE names one (CI), so a new APK installs over the
# app on the phone and keeps its data; unset, Gradle's own debug key.
grep -q 'BM_ANDROID_DEBUG_KEYSTORE' "$gradle" || cat >> "$gradle" <<'GRADLE'

android { signingConfigs { getByName("debug") { System.getenv("BM_ANDROID_DEBUG_KEYSTORE")?.let { storeFile = file(it) } } } }
GRADLE
# An APK of an earlier build would be taken for this one's.
rm -rf gen/android/app/build/outputs/apk
npx tauri android build --debug --apk --target "$target"
find gen/android/app/build/outputs/apk -name '*.apk'
