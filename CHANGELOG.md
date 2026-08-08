# Changelog

Notable changes to Snippy. Versions follow `major.minor.patch`; the version in
`manifest.json` is the source of truth.

## 1.1.3 — 2026-08-08

First Chrome Web Store submission. No new user-facing features.

### Changed

- **Editor internals modularized.** `editor.js` (2954 lines) is now a thin
  bootstrap over 14 focused ES modules (state, canvas, panel, text, history,
  export, AI Lens, and friends). No intended behavior change; verified by an
  in-browser smoke test of every tool and 63 unit tests (up from 60).
- Store listing and README now lead with Snippy being fully open source and
  ad-free rather than its looks; new listing screenshots, promo tile, and
  redrawn toolbar/store icons in the brand gradient.

### Fixed

- Sidebar width is restored on editor load even if the resize handle is
  missing, and review-driven hardening landed in the build's module allowlist
  scanner and test suite.

## 1.1.2 — 2026-08-07

### Fixed

- **Concurrent captures no longer overwrite each other.** Each capture is now
  stored as its own namespaced record (`snippyCapture:<id>`) and the editor
  opens with `?capture=<id>`, instead of every capture sharing one storage
  slot. Stale records and the old shared-cache keys are pruned automatically.
- Editor polish: text wrapping preserves leading indentation, and textarea
  resizing and highlighter stroke behavior were corrected. The capture
  workflow and editor behavior helpers gained unit tests (`tests/`).

### Changed

- The background service worker is now an ES module.

## 1.1.1 — 2026-08-06

### Added

- **Resize text boxes to control line wrapping.** Select a text annotation and
  drag its right-edge handle to set the wrap width. Text reflows as you drag,
  the left edge stays fixed, and the new width is preserved when editing or
  changing the font size. Width changes support Undo and Redo.

## 1.1.0 — 2026-08-06

The "edit what you already drew" release, driven by user feedback.

### Added

- **Edit shapes after placing them.** Select any annotation to move it,
  restyle it from the properties panel (color, line weight, fill, font — the
  panel reflects the selected shape's own settings), or reshape it with drag
  handles: arrow/line endpoints, rectangle/ellipse/blur corners. All of it is
  undoable, and selection chrome never appears in exports.
- **Inline text editing, discoverable.** Double-click any text annotation —
  from any tool — to reopen and edit it. A `text` hover cursor and a one-time
  hint point the way. (The mechanism existed before but was hidden behind the
  Select tool.)
- **My Colors.** Save up to six of your own colors (e.g. a company brand
  palette) with the `+` button or an empty slot; right-click removes. They
  persist across sessions and also appear as fill swatches.
- **Redo.** `Ctrl/⌘+Shift+Z` or `Ctrl/⌘+Y`, plus a toolbar button next to
  Undo.
- **Full-viewport capture.** `Ctrl/⌘+Shift+F` captures the visible tab
  straight to the editor — no drag-select. Inside the overlay, `Enter` now
  selects the whole page.
- **Fonts.** Arial and a System-sans stack join the font picker, rendered at
  normal weight for a cleaner, more professional look.

### Changed

- **Text drop shadow is now opt-in and off by default.** Previously every
  text annotation got a baked-in shadow; there's now a toggle in the Font
  panel, remembered per annotation and previewed live while editing.

### Fixed

- Rapid back-to-back Quick Snips can no longer overwrite each other's
  clipboard path or show a misleading error for the superseded snip.
- Quick mode skips a wasted full-size PNG encode (faster on large, high-DPI
  selections).
- The native helper installer copies the helper to a stable per-user
  directory, so moving or deleting the source checkout no longer breaks
  Quick Snip (re-run the installer after upgrading).
- Corner-resize no longer jumps when dragged past the opposite edge; Escape
  during a drag reverts it cleanly; redo history is invalidated correctly by
  new edits; editor shortcuts no longer fire while typing in panel fields.
- Docs and tooltips now accurately describe Save + Path behavior when
  Chrome's "Ask where to save each file" setting is enabled.
