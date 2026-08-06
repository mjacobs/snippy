#!/usr/bin/env bash
# Install the Snippy native-messaging host manifest for Google Chrome.
#
# Usage: ./install-host.sh <extension-id>
#
# Extension IDs are per-checkout for unpacked installs, so there is no safe
# default — pass yours explicitly.
set -euo pipefail

EXT_ID="${1:-}"
if [[ -z "$EXT_ID" ]]; then
  cat >&2 <<'EOF'
Usage: ./install-host.sh <extension-id>

Find your extension ID at chrome://extensions (enable Developer mode in the
top-right corner), then look for the "ID" line on the Snippy card.
EOF
  exit 1
fi
[[ "$EXT_ID" =~ ^[a-p]{32}$ ]] || { echo "Invalid extension ID: $EXT_ID" >&2; exit 1; }
HOST_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/snippy_host.py"

# Chrome reads native-messaging host manifests from a per-OS directory; a
# manifest written anywhere else is silently ignored, so refuse rather than
# report a success Chrome will never see.
case "$(uname -s)" in
  Linux)  HOST_DIR="$HOME/.config/google-chrome/NativeMessagingHosts" ;;
  Darwin) HOST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts" ;;
  *)
    echo "Unsupported platform: $(uname -s). The helper supports Linux and macOS;" >&2
    echo "on Windows the native host would need a registry entry (not provided)." >&2
    exit 1
    ;;
esac
HOST_MANIFEST="$HOST_DIR/io.kenn.snippy.json"
LAUNCHER="$HOST_DIR/io.kenn.snippy.launcher.sh"

chmod +x "$HOST_PATH"

[[ -d "$HOST_DIR" ]] || mkdir -p "$HOST_DIR"

# Chrome launches native hosts with its own (minimal) environment, not the
# terminal's PATH — on macOS a Homebrew python3 found here may be invisible
# to Chrome. Resolve the interpreter now and bake its absolute path into a
# generated launcher, which is what the manifest points at.
PY3="$(command -v python3)" || { echo "python3 not found in PATH" >&2; exit 1; }
# shlex.quote so paths containing quotes/dollars/backticks can't become
# shell syntax inside the generated launcher.
PY3="$PY3" HOST_PATH="$HOST_PATH" "$PY3" - "$LAUNCHER" <<'EOF'
import os, shlex, sys
body = '#!/bin/sh\nexec %s %s "$@"\n' % (
    shlex.quote(os.environ["PY3"]),
    shlex.quote(os.environ["HOST_PATH"]),
)
with open(sys.argv[1], "w") as f:
    f.write(body)
EOF
chmod +x "$LAUNCHER"

# Encode with a real JSON encoder — a checkout path containing quotes or
# backslashes would silently corrupt a heredoc-interpolated manifest.
LAUNCHER="$LAUNCHER" EXT_ID="$EXT_ID" "$PY3" - "$HOST_MANIFEST" <<'EOF'
import json, os, sys
manifest = {
    "name": "io.kenn.snippy",
    "description": "Snippy temp-file helper",
    "path": os.environ["LAUNCHER"],
    "type": "stdio",
    "allowed_origins": ["chrome-extension://%s/" % os.environ["EXT_ID"]],
}
with open(sys.argv[1], "w") as f:
    json.dump(manifest, f, indent=2)
    f.write("\n")
EOF

echo "Installed native-messaging host manifest:"
echo "  $HOST_MANIFEST"
echo "  -> $LAUNCHER (python3: $PY3)"
echo "  -> $HOST_PATH"
echo "  allowed origin: chrome-extension://$EXT_ID/"
echo
echo "Reload the Snippy extension at chrome://extensions for this to take effect."
