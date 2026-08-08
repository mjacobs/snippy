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
  ai-lens-api.mjs
  capture-workflow.mjs
  editor-ai-lens.mjs
  editor-behavior.mjs
  editor-canvas.mjs
  editor-export.mjs
  editor-geometry.mjs
  editor-history.mjs
  editor-metadata.mjs
  editor-panel.mjs
  editor-shapes.mjs
  editor-sidebar.mjs
  editor-state.mjs
  editor-text.mjs
  editor-toast.mjs
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

### Every imported module must be on the allowlist ###########################
# Leaving one off ships an extension that loads and then dies on the first
# missing import — a blank editor with one console error. Cheap to catch here.
#
# Plain-grep scanner, not a JS parser. Covers what this codebase actually
# writes: single- or double-quoted `from './file.mjs'` imports (incl. the
# multi-line `import {\n ... \n} from './file.mjs'` form, since the closing
# `from '...'` still lands on its own line) and side-effect imports with no
# `from` clause (`import './file.mjs'`). Does NOT cover dynamic `import()` or
# nested relative paths (`./sub/file.mjs`) — neither form is used anywhere in
# this codebase today (verified via grep); if that changes, extend the regex
# below (e.g. widen the character class to allow `/`) rather than assuming
# coverage.
unlisted=0
for f in "${FILES[@]}"; do
  [[ "$f" == *.js || "$f" == *.mjs ]] || continue
  [[ -f "$f" ]] || continue
  while read -r dep; do
    [[ -n "$dep" ]] || continue
    if ! printf '%s\n' "${FILES[@]}" | grep -qx "$dep"; then
      echo "ERROR: $f imports $dep, which is not in FILES" >&2
      unlisted=1
    fi
  done < <(grep -oE "(from[[:space:]]+['\"]\./[A-Za-z0-9_.-]+['\"]|^import[[:space:]]+['\"]\./[A-Za-z0-9_.-]+['\"])" "$f" \
    | sed -E "s/^(from|import)[[:space:]]+['\"]\.\///; s/['\"]\$//")
done
[[ "$unlisted" -eq 0 ]] || { echo "Aborting: add the modules above to FILES." >&2; exit 1; }

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
