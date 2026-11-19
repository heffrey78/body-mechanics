#!/usr/bin/env bash
# Rebuilds every app icon from the Ring face SVGs in src-tauri (#74). Needs node and rsvg-convert, magick.
#   app-icon.svg        the full icon on its navy tile (desktop, legacy Android square)
#   app-icon-fg/-bg/-mono.svg  Android's adaptive layers and the themed (monochrome) icon
#   app-icon-round.svg  legacy round launcher (Android 7 and older)
#   app-icon-24.svg     24-32 px: eyes only      app-icon-16.svg   16 px: an open ring
set -euo pipefail
cd "$(dirname "$0")/../src-tauri"
out=$(mktemp -d)
npx tauri icon app-icon.json -o "$out" >/dev/null 2>&1
for f in 32x32.png 64x64.png 128x128.png 128x128@2x.png icon.png icon.icns; do cp "$out/$f" "icons/$f"; done
rm -rf icons/android && cp -r "$out/android" icons/android
# Launchers that ask for the round icon get the adaptive one too, on Android 8 and later.
cp icons/android/mipmap-anydpi-v26/ic_launcher.xml icons/android/mipmap-anydpi-v26/ic_launcher_round.xml
for d in mdpi:48 hdpi:72 xhdpi:96 xxhdpi:144 xxxhdpi:192; do
  rsvg-convert -w "${d##*:}" -h "${d##*:}" app-icon-round.svg -o "icons/android/mipmap-${d%%:*}/ic_launcher_round.png"
done
rsvg-convert -w 32 -h 32 app-icon-24.svg -o icons/32x32.png
rsvg-convert -w 16 -h 16 app-icon-16.svg -o "$out/i16.png"
rsvg-convert -w 24 -h 24 app-icon-24.svg -o "$out/i24.png"
for s in 48 64 128 256; do rsvg-convert -w $s -h $s app-icon.svg -o "$out/i$s.png"; done
magick "$out/i16.png" "$out/i24.png" icons/32x32.png "$out/i48.png" "$out/i64.png" "$out/i128.png" "$out/i256.png" icons/icon.ico
rm -rf "$out"
echo "icons rebuilt"
