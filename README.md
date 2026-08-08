<div align="center">

# Snippy

**A fast, fully open-source screenshot & annotation tool for Chrome.
Snippy has no ads, no accounts, no paid tiers.**

Select any region of a page, mark it up with arrows, shapes, text, highlights,
and blurs, then copy it or save it as a JPEG — all in a clean, glassmorphic
editor. An optional AI Lens adds OCR, translation, and explanations using your
own Google Gemini key.

</div>

---

## Features

- **Instant capture** — click the toolbar icon or press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> (<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> on Mac), then drag to select. The viewport freezes so you can select precisely, with a live pixel-dimension readout. Press <kbd>Enter</kbd> instead of dragging to capture the whole visible page, or skip the overlay entirely with <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> (<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> on Mac) for a one-click capture of the visible viewport (not the full scroll height) straight to the editor.
- **Full annotation set** — freehand pen, arrows, rectangles (outline or filled), neon highlighter, text (optional drop shadow, several typefaces), and a **pixelate/blur** tool for redacting sensitive info.
- **Edit in place** — select any annotation to move it; restyle supported types from the properties panel (color/width/fill/font — blur regions have nothing to restyle) or reshape with drag handles (arrow endpoints, shape corners, and text-box width); narrowing text reflows it onto additional lines; double-click text to edit it.
- **My Colors** — save up to six of your own colors (e.g. brand palette); they persist across sessions.
- **Undo & redo** — undo the last edit (<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Z</kbd>), redo (<kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> or <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>Y</kbd>), or clear everything and restore it with one undo.
- **Export** — copy the annotated result straight to your clipboard, or download a high-quality JPEG (white-matted so nothing goes transparent).
- **Quick Snip for terminal agents** — press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd> (<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd> on Mac) and drag: the region is saved to a temp file and its absolute path lands on your clipboard, ready to paste into Claude Code or any CLI. No editor tab; temp files become eligible for cleanup after ~24 hours and are removed at a later quick snip or browser startup. With the optional [native helper](#silent-saves-optional-native-helper) files go to a per-user temp dir; otherwise to `Downloads/snippy.tmp/`.
- **AI Lens (optional)** — bring your own Google Gemini or Vertex AI key to read text (OCR), explain a screenshot, translate it, or turn a table into Markdown. See [AI Lens](#ai-lens-optional).
- **Private by default** — nothing leaves your device unless you explicitly use AI Lens. See [PRIVACY.md](PRIVACY.md).
- **Free & open source** — MIT-licensed and non-commercial: no ads, no accounts, no paid tiers. The whole extension is this repo.

## Install (unpacked)

Snippy isn't on the Chrome Web Store yet. To install it directly:

1. **Download and unzip** the latest `snippy-v<version>.zip` release. You'll get a folder named `snippy`.
2. Open Chrome and go to **`chrome://extensions`**.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the unzipped **`snippy`** folder.
5. Snippy appears in your toolbar. Click the puzzle-piece icon and **pin** it for easy access.

> Keep the `snippy` folder somewhere permanent — Chrome loads the extension from
> that folder, so deleting or moving it will disable Snippy. To update later,
> replace the folder's contents and click the ↻ refresh icon on the Snippy card
> in `chrome://extensions`.

> Snippy can't run on Chrome's own pages (`chrome://…`, the Web Store, or
> `view-source:`) — that's a browser security rule, not a bug.

## Usage

1. Go to the page you want to capture.
2. Click the Snippy icon (or press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>). Drag to select an area, then release. <kbd>Esc</kbd> cancels.
3. Your crop opens in the Snippy Editor. Pick a tool on the left, tweak its color/weight/size on the right, and annotate.
4. **Copy Image** puts it on your clipboard; **Download JPEG** saves it.

### Keyboard shortcuts (editor)

| Shortcut | Action |
|----------|--------|
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>Z</kbd> | Undo last edit |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>C</kbd> | Copy to clipboard |
| <kbd>Ctrl</kbd>/<kbd>⌘</kbd> + <kbd>S</kbd> | Download image |
| <kbd>Esc</kbd> | Deselect current tool |

### Quick Snip (path in clipboard)

For a throwaway screenshot to paste into a terminal agent (e.g. Claude Code):
press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>E</kbd>, drag, release. Snippy
saves a JPEG to a temp file, copies its absolute path to your clipboard, and
shows a "Snipped — path copied" toast — just paste the path into the
terminal. The editor never opens. With the
[native helper](#silent-saves-optional-native-helper) installed, files go to
a per-user temp dir and are cleaned ~24 hours later at the next quick snip;
without it, they go to `Downloads/snippy.tmp/` and are cleaned ~24 hours
later at the next quick snip or browser restart (this also applies to files
from the editor's Save + Path button, which defaults to `snippy.tmp`;
if Chrome's "Ask where to save" setting is on and you pick a different
location, that file is yours and is not auto-cleaned).
Rebind the shortcut at `chrome://extensions/shortcuts`.

### Silent saves (optional native helper)

If Chrome's "Ask where to save each file before downloading" setting is on,
the downloads API can't save silently — you'd get a file chooser on every
quick snip. Installing the bundled native-messaging helper avoids that
(Linux and macOS; Python 3 required): run
`./native/install-host.sh <extension-id>` once (find your extension ID at
chrome://extensions with Developer mode on, on the Snippy card), then reload
the extension. The installer copies the helper to a stable per-user
directory, so re-run it after upgrading Snippy to pick up helper changes. Quick snips then write straight to `$XDG_RUNTIME_DIR/snippy`
(or `/tmp/snippy-<uid>` if `$XDG_RUNTIME_DIR` isn't set) with no chooser,
regardless of that Chrome setting. The OS handles cleanup of that directory
on its own schedule (the helper also opportunistically removes its own files
after ~24 hours). Without the helper installed, Snippy falls back to
`Downloads/snippy.tmp/` as described above — where that Chrome setting, if
enabled, will show a pre-filled chooser you just need to confirm.

## AI Lens (optional)

AI Lens is off until you add your own key — the developer never sees your key or
your images.

1. In the editor, click the **AI Lens** tool, then **Configure AI Model**.
2. Choose a provider:
   - **Google AI Studio** — the easy path. Get a free key at
     [aistudio.google.com](https://aistudio.google.com/), paste it in, and save.
   - **Google Cloud Vertex AI** — for GCP users; also enter your project ID and
     region.
3. Use a preset (**Read Text**, **Explain**, **Translate**, **Format**) or type
   a custom question. The current image is sent to Google and the answer appears
   in the panel.

The model defaults to `gemini-2.5-flash` and is editable. Your key stays in
`chrome.storage.local`; **Reset Key** clears it.

## Privacy

Captures, annotations, and your AI key are stored only in your browser
(`chrome.storage.local`). The single time anything is sent off your device is
when you click an AI Lens action, which goes browser → Google → browser using
your own key. Full details in [PRIVACY.md](PRIVACY.md).

## Permissions

| Permission | Why |
|------------|-----|
| `activeTab` | Capture the current tab's pixels, only when you invoke Snippy. |
| `scripting` | Inject the selection overlay into the page. |
| `storage` | Hold the captured image, preferences, and (optionally) your AI key locally. |

No host permissions are requested.

## Development

Plain HTML/CSS/JS, no build step — this repo *is* the extension. Load the folder
unpacked (steps above) and edit the source directly; click the refresh icon on
the Snippy card to reload.

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest |
| `background.js` | Service worker: capture + inject + open editor |
| `content.js` / `content.css` | On-page selection overlay |
| `editor.html` / `editor.css` | The annotation editor's markup and styling |
| `editor.js` | Editor entry point: pointer and keyboard handling, module wiring |
| `fonts/` | Self-hosted Inter + Outfit (no remote font requests) |
| `icons/` | Toolbar/store icons |

`editor.js` is loaded as `<script type="module">` and is the page's only entry
point; everything else it needs it imports.

| Module | Role |
|--------|------|
| `editor-state.mjs` | The shared, sealed state object and its constants |
| `editor-canvas.mjs` | Rendering, text measurement, coordinate conversion |
| `editor-panel.mjs` | Tool grid, property controls, My Colors |
| `editor-text.mjs` | The in-place text editing layer |
| `editor-history.mjs` | Undo / Redo / Clear |
| `editor-export.mjs` | Copy to clipboard, save JPEG, save + copy path |
| `editor-ai-lens.mjs` | AI Lens panel (Gemini AI Studio / Vertex AI) |
| `editor-toast.mjs` / `editor-sidebar.mjs` | Status messages; sidebar resize |
| `editor-shapes.mjs` | Hit-testing, bounding boxes, reshape handles (pure) |
| `editor-geometry.mjs` | Text wrapping and box sizing (pure) |
| `editor-behavior.mjs` | Tool/interaction predicates, plus a couple of DOM/storage helpers (dependency-injected, easy to test) |
| `editor-metadata.mjs` | Source-URL sanitizing, JPEG XMP / PNG iTXt (pure) |
| `ai-lens-api.mjs` | Gemini request/response shaping (pure) |
| `capture-workflow.mjs` | Handing a capture from the worker to the editor via injected storage/tabs (dependency-injected, easy to test) |

### Checks

```bash
./check.sh    # syntax check every file, then run the unit tests
./build.sh    # package dist/snippy-v<version>.zip
```

`check.sh` cannot exercise the canvas or `chrome.*`, so run
[`docs/editor-smoke-test.md`](docs/editor-smoke-test.md) by hand after editor
changes.

## License

[MIT](LICENSE) © 2026 Matthew Jacobs
