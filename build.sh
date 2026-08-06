#!/usr/bin/env bash
###############################################################################
# Snippy — package the unpacked extension into a clean, store-ready zip.
#
# Stages ONLY the runtime files (an explicit allowlist) into a top-level
# snippy/ folder, then zips it — so dev artifacts (.git, .claude, .kata.toml,
# AGENTS.md, CHROMEWEBSTORE.md, build.sh itself, dist/) never ship.
#
# Allowlist (not denylist) on purpose: heading for the Web Store, you never
# want to accidentally ship a stray key or dev file. Add a runtime asset here
# when you add one to the extension.
#
#   Usage:  ./build.sh
#   Output: dist/snippy-v<version>.zip   (version is read from manifest.json)
###############################################################################
set -euo pipefail

# Always operate from the repo root (this script's own directory).
cd "$(dirname "$0")"

### Files that ship ##########################################################
FILES=(
  manifest.json
  background.js
  content.js
  content.css
  offscreen.html
  offscreen.js
  editor.html
  editor.js
  editor-geometry.mjs
  editor.css
  LICENSE
  README.md
  PRIVACY.md
)
DIRS=(
  fonts
  icons
  native
)

### Read the version #########################################################
VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' manifest.json | head -1)
[[ -n "$VERSION" ]] || { echo "ERROR: could not read \"version\" from manifest.json" >&2; exit 1; }

### Stage ####################################################################
DIST="dist"
STAGE="$DIST/snippy"
ZIP="$DIST/snippy-v${VERSION}.zip"

# Fresh staging, scoped strictly to dist/ (never the repo itself).
rm -rf "$STAGE" "$ZIP"
mkdir -p "$STAGE"

missing=0
for f in "${FILES[@]}"; do
  if [[ -f "$f" ]]; then
    mkdir -p "$STAGE/$(dirname "$f")"   # future-proof for nested paths
    cp "$f" "$STAGE/$f"
  else
    echo "ERROR: missing runtime file: $f" >&2
    missing=1
  fi
done
for d in "${DIRS[@]}"; do
  if [[ -d "$d" ]]; then
    cp -r "$d" "$STAGE/$d"
  else
    echo "ERROR: missing runtime dir: $d/" >&2
    missing=1
  fi
done
[[ "$missing" -eq 0 ]] || { echo "Aborting: runtime files missing." >&2; exit 1; }

### Zip ######################################################################
( cd "$DIST" && zip -r -q "snippy-v${VERSION}.zip" snippy -x '*.DS_Store' )

### Report ###################################################################
echo "✓ Built $ZIP ($(du -h "$ZIP" | cut -f1))"
echo "  Load unpacked: unzip it, then chrome://extensions → Load unpacked → the snippy/ folder."
echo
echo "Contents:"
unzip -l "$ZIP"
