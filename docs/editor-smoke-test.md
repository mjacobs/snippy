# Editor smoke test

Snippy has no browser test harness. `./check.sh` covers syntax and the pure
logic modules, but nothing automated exercises the canvas, the DOM, or
`chrome.*`. Run this by hand after changing anything under the editor —
especially after a refactor, where the whole point is that behavior did not
change.

Takes about five minutes.

## Setup

1. `chrome://extensions` → Load unpacked → this directory. If it was already
   loaded, hit Reload; module changes do not hot-reload.
2. Open the console for the editor tab and leave it open. **Any red error is a
   failure**, even if the feature looks fine — a broken import shows up here
   first.
3. On any normal web page, press `Ctrl+Shift+S` and drag a crop box. The editor
   tab should open with the screenshot and the pixel dimensions in the header.

## Tools

Each one: pick the tool, drag on the canvas, confirm the annotation appears
where you drew it and survives a redraw (switch tools and back).

- [ ] **Pen** — freehand line follows the cursor
- [ ] **Highlighter** — translucent, and visibly broader than the pen at the
      same stroke setting
- [ ] **Arrow** — head lands at the end of the drag and points the right way
- [ ] **Rectangle** — hollow; then tick Fill and draw another, semi-transparent
- [ ] **Ellipse** — same, hollow and filled
- [ ] **Blur** — pixelates the region underneath
- [ ] **Text** — click, type, press Enter. Text lands where you clicked
- [ ] A click without a drag leaves nothing behind (too small to count)

## Text

- [ ] Type a long sentence — it wraps inside the box rather than running off
- [ ] `Shift+Enter` makes a new line; `Enter` commits; `Escape` cancels
- [ ] Drag the textarea's resize corner — wrapping reflows and the box grows
      taller to fit
- [ ] Double-click committed text (in any tool) to reopen it; the box comes
      back the same width, not narrower
- [ ] Reopen and clear all the text, then commit — the shape is deleted
- [ ] Change color / size / font / shadow *while* typing — the preview updates
      and the committed shape keeps the change
- [ ] Shadow toggle is off by default for new text

## Select, move, edit

- [ ] Click a shape — dashed outline plus round handles
- [ ] Hover: `move` over a shape body, `text` over text, a resize cursor over
      each handle
- [ ] Drag the body to move it; drag a corner to resize; drag an arrow endpoint
- [ ] Drag a box corner *past* the opposite corner — it flips cleanly and does
      not jump
- [ ] Drag the east handle on text to change the wrap width
- [ ] Click empty canvas to deselect; `Escape` deselects, then switches to
      Select
- [ ] `Delete` / `Backspace` removes the selected shape — but **not** while the
      cursor is in the hex field or the font-size box
- [ ] With a shape selected, the property panel shows only the controls that
      shape honors (no color for blur, no stroke for text) and changing one
      restyles the selected shape

## My Colors

- [ ] Pick a custom color, click an empty My Colors slot — it fills
- [ ] Click a saved swatch — it becomes the active color
- [ ] Saved colors also appear in the Fill palette
- [ ] Right-click a saved swatch to remove it; if it was the active fill, the
      panel falls back to Match Stroke
- [ ] Reload the editor — saved colors are still there
- [ ] Try to save a color already in the list — toast says so, no duplicate

## Undo / redo

- [ ] Undo reverses each of: draw, delete, move, resize, restyle, text re-edit
- [ ] Redo re-applies each of them
- [ ] Dragging the color picker or holding a key in the font-size box makes
      **one** undo step, not dozens
- [ ] Clear wipes everything; Undo brings it all back
- [ ] Drawing something new after an undo disables Redo
- [ ] `Ctrl+Z`, `Ctrl+Shift+Z`, `Ctrl+Y` match the buttons

## Export

- [ ] **Copy** — paste into another app; the image arrives, with no dashed
      selection outline even if a shape was selected when you copied
- [ ] **Save** — downloads a JPEG on a white background
- [ ] **Save + path** — downloads to `Downloads/snippy.tmp/` and copies the
      absolute path to the clipboard; the toast names the path
- [ ] `Ctrl+C` and `Ctrl+S` match the buttons
- [ ] Metadata survived: `exiftool -XMP:Source saved.jpg` shows the page URL,
      with no query string or credentials

## AI Lens

- [ ] Open the AI Lens tool — setup panel appears if no key is stored
- [ ] Switching provider to Vertex reveals Project ID and Region; back to AI
      Studio hides them
- [ ] Save a key — the panel switches to active and the tool icon marks it as
      configured
- [ ] Run a preset (OCR / Explain / Translate / Table) — spinner, then a result
- [ ] Copy the AI output
- [ ] Reset clears the config and reopens setup
- [ ] Reload — the saved config is still active

## Layout

- [ ] Drag the sidebar edge to resize; it stops at roughly 240px and 600px
- [ ] Reload — the width is remembered

## Packaging

- [ ] `./build.sh` succeeds and the zip contains every `.mjs` (the build fails
      loudly if an imported module is missing from its allowlist)
- [ ] Load the *unzipped* build as an unpacked extension and repeat the Setup
      step — this is the only check that the shipped file list is complete
