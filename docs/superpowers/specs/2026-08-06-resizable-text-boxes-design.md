# Resizable Text Boxes in Select Mode

Date: 2026-08-06

Status: Approved

Kata: `t4gx`

## Problem and outcome

Snippy already stores a wrap width when a user creates or re-edits text. The
canvas uses that width to break text across lines, but the Select tool treats
text as move-only. Changing an existing text box's width therefore requires the
less-discoverable double-click editing path.

Selecting a text annotation will expose a handle on the middle of its right
edge. Dragging that handle will keep the annotation's left edge fixed, change
its wrap width, and reflow the text live onto more or fewer lines.

## Interaction

- A selected text annotation shows its full text-box boundary, including empty
  space after a short final line, rather than outlining only the visible glyphs.
- One circular handle appears at the vertical center of the right edge.
- The handle uses an east-west resize cursor.
- Horizontal pointer movement changes the wrap width. Vertical movement does
  not move the text or directly set its height.
- Text reflows while the pointer moves. Its calculated height grows or shrinks
  with the resulting line count.
- The left edge and top-left text origin remain fixed throughout the gesture.
- Width stops shrinking at two font-size units. This leaves a usable target and
  avoids a zero-width box while remaining proportional across font sizes.
- Releasing the pointer records the complete drag as one Undo/Redo action.
- Pressing Escape during a drag restores the width from before the gesture.
- Double-click editing and moving a selected text annotation continue to work
  as they do now.

For an older text shape without a stored width, Snippy will use the shape's
current measured width as the starting width. The first completed resize adds
the explicit width to that shape.

## Design

The feature will extend the existing selection-handle and `reshape` history
paths in `editor.js`; it will not introduce another editing mode.

Text layout will have one shared calculation for wrapped lines, rendered
height, measured ink width, and effective box width. Drawing, hit-testing, the
selection boundary, and handle placement will consume that calculation so they
cannot disagree about where a text box ends after reflow.

`getHandles` will return one text-specific right-edge handle. Starting a drag
will snapshot the shape's `width` value. Pointer movement will set the width to
the horizontal distance from the fixed `x1`, clamped to the minimum. The
existing redraw loop will immediately render the new line breaks and move the
handle to the new edge.

The existing generic `reshape` Undo/Redo entry already swaps any properties
listed in its `prev` object. Text resizing will store `width` there, while the
current arrow and box resizes will continue storing their coordinates. Escape
cancellation will restore the same saved property map.

## Boundaries and compatibility

- This changes text width only. It does not add manual text-box height,
  vertical alignment, font scaling, rotation, or left-edge resizing.
- Existing wrapping remains word-based. A single word wider than the box may
  continue past the right boundary rather than being split mid-word.
- No persistent-data migration is needed. Width is already part of new text
  shapes, and shapes without it retain their current rendering until resized.
- Selection chrome remains editor-only and is still suppressed from copied or
  downloaded images.

## Verification

Verification will cover these user-visible cases:

1. Select a text annotation and see one right-edge resize handle.
2. Narrow the box and observe live wrapping onto additional lines without the
   left edge moving.
3. Widen it and observe lines joining again.
4. Preserve manual line breaks while automatic wrapping changes around them.
5. Enforce the minimum width during a far-left drag.
6. Undo and redo a resize as one action.
7. Cancel an in-progress resize with Escape.
8. Move and double-click-edit text after resizing.
9. Confirm old text shapes without `width` begin from their measured width.
10. Confirm selection outlines and handles are absent from image exports.

The repository has no automated test suite, so verification will combine a
JavaScript syntax check with a focused headless-Chrome interaction test against
the real editor canvas.
