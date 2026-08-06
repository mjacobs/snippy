#!/usr/bin/env python3
"""Chrome native-messaging host for Snippy's Quick Snip.

Writes a JPEG (sent as base64) to a per-user temp directory and returns the
absolute path. This exists because Chrome's "Ask where to save each file
before downloading" preference forces a save-file dialog even for
chrome.downloads.download({ saveAs: false }); a native host bypasses the
downloads API entirely, so quick snips stay silent regardless of that
setting. See background.js for the downloads-based fallback used when this
host isn't installed.

This host handles exactly one message per invocation: Chrome's native-messaging
protocol spawns a new process for each message and closes stdin after the
response. The host processes one request and exits.

Protocol: stdin/stdout each frame is a 4-byte little-endian length prefix
followed by that many bytes of UTF-8 JSON.
"""

import base64
import json
import os
import re
import stat as statmod
import struct
import sys
import time


def _default_tmp_dir():
    """Prefer $XDG_RUNTIME_DIR/snippy (tmpfs, per-user, cleared on logout)
    when it's set to an absolute path; otherwise fall back to a per-uid
    directory under /tmp so multiple users on one box don't collide or
    race each other's cleanup/symlink checks."""
    runtime_dir = os.environ.get("XDG_RUNTIME_DIR", "")
    if runtime_dir and os.path.isabs(runtime_dir):
        return os.path.join(runtime_dir, "snippy")
    return f"/tmp/snippy-{os.getuid()}"


TMP_DIR = _default_tmp_dir()
MAX_FRAME_BYTES = 100 * 1024 * 1024  # 100 MB
MAX_DECODED_SIZE = 50 * 1024 * 1024  # 50 MB
MAX_AGE_SECONDS = 24 * 60 * 60  # 24 hours
# Also matches .part staging files so a mid-write kill can't leave one
# behind forever (see write_temp_file's link-and-unlink publication).
CLEANUP_NAME_RE = re.compile(r"^snippy_\d+(_\d+)?\.jpg(\.part)?$")


def read_message():
    raw_len = sys.stdin.buffer.read(4)
    if len(raw_len) == 0:
        return None  # stdin closed / EOF
    if len(raw_len) < 4:
        raise ValueError("truncated length prefix")
    (msg_len,) = struct.unpack("<I", raw_len)
    if msg_len > MAX_FRAME_BYTES:
        raise ValueError("frame too large")
    raw_msg = sys.stdin.buffer.read(msg_len)
    if len(raw_msg) < msg_len:
        raise ValueError("truncated message body")
    return json.loads(raw_msg.decode("utf-8"))


def send_message(obj):
    encoded = json.dumps(obj).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def ensure_tmp_dir():
    """Create TMP_DIR (mode 0700) if missing; refuse to write through an
    existing path that isn't a plain, self-owned directory."""
    try:
        os.mkdir(TMP_DIR, 0o700)
    except FileExistsError:
        pass
    # Whether we just created it or it already existed, verify it's safe to
    # use: not a symlink, and owned by us. lstat so a symlink is detected
    # rather than followed.
    st = os.lstat(TMP_DIR)
    if statmod.S_ISLNK(st.st_mode):
        raise RuntimeError(f"{TMP_DIR} is a symlink; refusing to use it")
    if not statmod.S_ISDIR(st.st_mode):
        raise RuntimeError(f"{TMP_DIR} is not a directory; refusing to use it")
    if st.st_uid != os.getuid():
        raise RuntimeError(f"{TMP_DIR} is not owned by the current user")
    # A pre-existing self-owned dir may carry loose modes; tighten so other
    # local users can't delete or pre-create screenshot paths.
    if st.st_mode & 0o077:
        os.chmod(TMP_DIR, 0o700)


def cleanup_old_files():
    """Best-effort: remove regular files directly inside TMP_DIR older than
    24h, but only files this host itself created (name matches
    snippy_<ms>[_<n>].jpg) — anything else in TMP_DIR is left untouched.
    Errors on individual files are ignored."""
    try:
        now = time.time()
        with os.scandir(TMP_DIR) as it:
            for entry in it:
                try:
                    if not CLEANUP_NAME_RE.match(entry.name):
                        continue
                    if not entry.is_file(follow_symlinks=False):
                        continue
                    st = entry.stat(follow_symlinks=False)
                    if now - st.st_mtime > MAX_AGE_SECONDS:
                        os.unlink(entry.path)
                except OSError:
                    pass
    except OSError:
        pass


def write_temp_file(decoded):
    base_ms = int(time.time() * 1000)
    suffix = 0
    while True:
        name = f"snippy_{base_ms}.jpg" if suffix == 0 else f"snippy_{base_ms}_{suffix}.jpg"
        path = os.path.join(TMP_DIR, name)
        # Stage, then publish with link-and-unlink: the final .jpg path only
        # ever comes into existence complete, so a mid-write kill (e.g. the
        # extension's timeout disconnecting us) can at worst leave a .part
        # file, which the cleanup sweep removes — never a truncated .jpg at
        # a path the extension might have handed out.
        staging = path + ".part"
        try:
            fd = os.open(staging, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
        except FileExistsError:
            suffix += 1
            continue
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(decoded)
                f.flush()
                os.fsync(f.fileno())
            # os.link never replaces an existing destination (unlike rename,
            # which would silently clobber a same-millisecond concurrent
            # save); FileExistsError → retry with the next suffix.
            try:
                os.link(staging, path)
            except FileExistsError:
                os.unlink(staging)
                suffix += 1
                continue
        except Exception:
            try:
                os.unlink(staging)
            except OSError:
                pass
            raise
        # Published: the save is committed regardless of what happens to the
        # staging name now. Removal is best-effort — a stale .part link is
        # collected by the cleanup sweep, and reporting failure here would
        # make the extension double-save a file that already exists.
        try:
            os.unlink(staging)
        except OSError:
            pass
        return path


def handle_request(request):
    if not isinstance(request, dict) or request.get("action") != "save_temp":
        return {"ok": False, "error": "unsupported action"}

    data = request.get("data")
    if not isinstance(data, str) or not data:
        return {"ok": False, "error": "missing data"}

    try:
        decoded = base64.b64decode(data, validate=True)
    except Exception as e:
        return {"ok": False, "error": f"invalid base64: {e}"}

    if not decoded:
        return {"ok": False, "error": "empty payload"}
    if len(decoded) > MAX_DECODED_SIZE:
        return {"ok": False, "error": "payload too large"}

    ensure_tmp_dir()
    cleanup_old_files()
    path = write_temp_file(decoded)
    return {"ok": True, "path": path}


def main():
    try:
        request = read_message()
    except Exception as e:
        try:
            send_message({"ok": False, "error": str(e)})
        except Exception:
            pass
        sys.exit(0)

    if request is None:
        sys.exit(0)

    try:
        response = handle_request(request)
    except Exception as e:
        print(f"snippy_host error: {e}", file=sys.stderr)
        response = {"ok": False, "error": str(e)}

    try:
        send_message(response)
    except Exception as e:
        print(f"snippy_host: failed to write response: {e}", file=sys.stderr)

    sys.exit(0)


if __name__ == "__main__":
    main()
