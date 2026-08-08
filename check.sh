#!/usr/bin/env bash
###############################################################################
# Snippy — the whole automated check suite.
#
# There is no build step and no browser test harness, so verification is:
#   1. a syntax check of every runtime and test file (catches errors that
#      would otherwise only surface as a blank editor page), and
#   2. the node:test unit suite over the pure logic modules.
#
# Two traps this script exists to avoid:
#
#   * Plain `node --check foo.js` EXITS 0 WITHOUT PARSING when foo.js contains
#     `import` and there is no package.json declaring "type": "module" — so it
#     silently passes files full of syntax errors. Anything the browser loads
#     as <script type="module"> must be checked with --input-type=module.
#   * `node --test tests/` tries to *require* a module named "tests" and
#     fails. The directory has to be expanded by the shell.
#
#   Usage:  ./check.sh
###############################################################################
set -euo pipefail

cd "$(dirname "$0")"

# Files the browser or service worker loads as ES modules. Everything else is
# a classic script.
is_module() {
  case "$1" in
    *.mjs) return 0 ;;
    editor.js|background.js) return 0 ;;
    *) return 1 ;;
  esac
}

check_one() {
  if is_module "$1"; then
    node --check --input-type=module < "$1"
  else
    node --check "$1"
  fi
}

### Syntax ###################################################################
echo "== syntax =="
status=0
for f in *.js *.mjs tests/*.mjs; do
  if check_one "$f" >/dev/null 2>&1; then
    echo "  ok      $f"
  else
    echo "  FAIL    $f"
    check_one "$f" || true
    status=1
  fi
done
[[ "$status" -eq 0 ]] || { echo "Aborting: syntax errors above." >&2; exit 1; }

### Unit tests ###############################################################
echo
echo "== node --test =="
node --test tests/*.test.mjs
