<div align="center">

# Snippy

**A fast, beautiful screenshot & annotation tool for Chrome.**

Select any region of a page, mark it up with arrows, shapes, text, highlights,
and blurs, then copy it or save it as a JPEG — all in a clean, glassmorphic
editor. An optional AI Lens adds OCR, translation, and explanations using your
own Google Gemini key.

</div>

---

## Features

- **Instant capture** — click the toolbar icon or press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> (<kbd>⌘</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> on Mac), then drag to select. The viewport freezes so you can select precisely, with a live pixel-dimension readout.
- **Full annotation set** — freehand pen, arrows, rectangles (outline or filled), neon highlighter, text with a drop shadow, and a **pixelate/blur** tool for redacting sensitive info.
- **Undo & restore** — undo the last edit (<kbd>Ctrl</kbd>+<kbd>Z</kbd>), or clear everything and restore it with one undo.
- **Export** — copy the annotated result straight to your clipboard, or download a high-quality JPEG (white-matted so nothing goes transparent).
- **AI Lens (optional)** — bring your own Google Gemini or Vertex AI key to read text (OCR), explain a screenshot, translate it, or turn a table into Markdown. See [AI Lens](#ai-lens-optional).
- **Private by default** — nothing leaves your device unless you explicitly use AI Lens. See [PRIVACY.md](PRIVACY.md).

## Install (unpacked)

Snippy isn't on the Chrome Web Store yet. To install it directly:

1. **Download and unzip** `snippy-v1.0.0.zip`. You'll get a folder named `snippy`.
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
| `editor.html` / `editor.js` / `editor.css` | The annotation editor |
| `fonts/` | Self-hosted Inter + Outfit (no remote font requests) |
| `icons/` | Toolbar/store icons |

## License

[MIT](LICENSE) © 2026 Matthew Jacobs
