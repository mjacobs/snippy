// The in-place text editing layer: the textarea that floats over the canvas
// while you type, and turning it into (or back out of) a text shape.
//
// The textarea previews the shape it will become — same family, weight, size
// and shadow — so the line breaks the user sees are the ones drawShape will
// produce.

import { resizeTextareaToContent } from './editor-behavior.mjs';
import { DEFAULT_FONT_FAMILY } from './editor-state.mjs';

export function createTextEditor({
  canvas,
  canvasWrapper,
  state,
  fontWeightForFamily,
  drawEverything,
  clearRedoStack,
  updateUndoButton,
  updatePropertyPanelsVisibility,
  syncColorControls,
  syncFontControls,
  syncPropertyPanelToSelection
}) {
  const textShadowCheckbox = document.getElementById('text-shadow-checkbox');


  function createTextarea(clientX, clientY, backingX, backingY, sourceShape, sourceIndex) {
    if (state.activeTextarea) return;

    // When re-editing an existing text shape, preserve its own color/font size.
    const editColor = sourceShape ? sourceShape.color : state.activeColor;
    const editFontSize = sourceShape ? sourceShape.fontSize : state.activeFontSize;
    // Re-editing restores the shape's own shadow setting; new shapes take
    // whatever the toggle is currently set to (default off).
    const editShadow = sourceShape ? !!sourceShape.shadow : state.activeTextShadow;
    if (textShadowCheckbox) textShadowCheckbox.checked = editShadow;

    // Create standard textarea
    const ta = document.createElement('textarea');
    ta.className = 'canvas-text-input';
    if (sourceShape) ta.style.minWidth = '0';
    // When re-editing, preview the shape's own family; otherwise the active one.
    const editFontFamily = sourceShape
      ? (sourceShape.fontFamily || DEFAULT_FONT_FAMILY)
      : state.activeFontFamily;

    ta.style.color = editColor;
    // Preview the chosen family/weight so wrap points match the rendered shape.
    ta.style.fontFamily = editFontFamily;
    ta.style.fontWeight = fontWeightForFamily(editFontFamily);
    // Live-preview the shadow too (mirrors the canvas 1.5px offset pass)
    ta.style.textShadow = editShadow ? '1.5px 1.5px rgba(0, 0, 0, 0.5)' : 'none';
    if (sourceShape) ta.value = sourceShape.text;

    // Position text area beautifully on top of wrapper, matching canvas bounding rect
    const canvasRect = canvas.getBoundingClientRect();
    const wrapperRect = canvasWrapper.getBoundingClientRect();

    // Calculate click offset relative to the canvas
    const clickXInCanvas = clientX - canvasRect.left;
    const clickYInCanvas = clientY - canvasRect.top;

    // Canvas offset relative to wrapper (taking into account padding/centering/borders)
    const canvasLeftInWrapper = canvasRect.left - wrapperRect.left;
    const canvasTopInWrapper = canvasRect.top - wrapperRect.top;

    // Match display size scale based on canvas bounding client rect
    const displayFontScale = editFontSize * (canvasRect.width / canvas.width);
    ta.style.fontSize = `${displayFontScale}px`;
    ta.style.height = `${displayFontScale * 1.5}px`;

    // Append to wrapper so that we can read its computed styles (padding/borders) from CSS
    canvasWrapper.appendChild(ta);

    const parseStyle = (val, fallback) => {
      const parsed = parseFloat(val);
      return isNaN(parsed) ? fallback : parsed;
    };

    const computed = window.getComputedStyle(ta);
    const paddingLeft = parseStyle(computed.paddingLeft, 4);
    const borderLeftWidth = parseStyle(computed.borderLeftWidth, 1);
    const paddingTop = parseStyle(computed.paddingTop, 4);
    const borderTopWidth = parseStyle(computed.borderTopWidth, 1);

    // Adjust position to offset the textarea's padding and border so that the typed text aligns exactly with the clicked point
    const relativeX = canvasLeftInWrapper + clickXInCanvas - (paddingLeft + borderLeftWidth);
    const relativeY = canvasTopInWrapper + clickYInCanvas - (paddingTop + borderTopWidth);

    // Give the box a sensible default width so text wraps onto multiple lines;
    // the user can drag the resize handle to widen/narrow it. Clamp so the
    // default doesn't spill past the right edge of the canvas.
    const availableWidth = Math.max(80, canvasRect.width - clickXInCanvas - 4);
    let defaultWidth = Math.min(Math.max(160, displayFontScale * 8), availableWidth);
    // Re-edit: reopen at the shape's stored wrap width so lines break the same
    if (sourceShape && sourceShape.width) {
      defaultWidth = sourceShape.width * (canvasRect.width / canvas.width);
      // The stored width is a content-box measure; a border-box textarea
      // would shrink by padding+border on every re-edit unless we add them back.
      if (computed.boxSizing === 'border-box') {
        const paddingRight = parseStyle(computed.paddingRight, 4);
        const borderRightWidth = parseStyle(computed.borderRightWidth, 1);
        defaultWidth += paddingLeft + paddingRight + borderLeftWidth + borderRightWidth;
      }
    }
    ta.style.width = `${defaultWidth}px`;

    ta.style.left = `${relativeX}px`;
    ta.style.top = `${relativeY}px`;
    ta.focus();

    state.activeTextarea = {
      element: ta,
      backingX: backingX,
      backingY: backingY,
      color: editColor,
      fontSize: editFontSize,
      fontFamily: editFontFamily,
      shadow: editShadow,
      source: sourceShape || null,
      sourceIndex: (typeof sourceIndex === 'number') ? sourceIndex : null
    };

    // Auto-expand typing height
    ta.addEventListener('input', () => resizeTextareaToContent(ta));

    // Native horizontal textarea resizing does not emit an input event.
    // Watch width changes so wrapped lines never remain clipped afterward.
    if (typeof ResizeObserver === 'function') {
      let lastWidth = ta.getBoundingClientRect().width;
      let resizeFrame = null;
      const observer = new ResizeObserver(entries => {
        const width = entries[0] && entries[0].contentRect
          ? entries[0].contentRect.width
          : ta.getBoundingClientRect().width;
        if (width === lastWidth) return;
        lastWidth = width;
        if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
        // ResizeObserver delivery cannot safely mutate the observed box.
        // Move the height adjustment to the next frame to avoid a loop.
        resizeFrame = requestAnimationFrame(() => {
          resizeFrame = null;
          if (ta.isConnected) resizeTextareaToContent(ta);
        });
      });
      observer.observe(ta);
      state.activeTextarea.resizeObserver = observer;
      state.activeTextarea.cancelPendingResize = () => {
        if (resizeFrame !== null) cancelAnimationFrame(resizeFrame);
      };
    }

    // Fit pre-filled multi-line text to its content height
    if (sourceShape) {
      resizeTextareaToContent(ta);
      syncColorControls(editColor);
      syncFontControls(editFontSize, editFontFamily, editShadow);
    }
    updatePropertyPanelsVisibility();

    // Special shortcuts for committing or canceling text
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commitActiveText();
      } else if (e.key === 'Escape') {
        cancelActiveText();
      }
    });
  }

  function commitActiveText() {
    if (!state.activeTextarea) return;

    const value = state.activeTextarea.element.value.trim();
    const src = state.activeTextarea.source;

    if (value) {
      // Record the box's content width in backing coords so drawShape can wrap
      // to the same width the textarea showed. clientWidth includes padding but
      // not the border, so subtract padding to get the true content box width.
      const el = state.activeTextarea.element;
      const computed = window.getComputedStyle(el);
      const padL = parseFloat(computed.paddingLeft) || 0;
      const padR = parseFloat(computed.paddingRight) || 0;
      const contentWidthDisplay = el.clientWidth - padL - padR;
      const canvasRect = canvas.getBoundingClientRect();
      const backingWidth = Math.max(
        state.activeTextarea.fontSize * 2,
        contentWidthDisplay * (canvas.width / canvasRect.width)
      );

      let shape;
      if (src) {
        // Re-edit: preserve the original shape's extra properties (e.g.
        // fontFamily) but refresh the wrap width from the (possibly resized)
        // textarea.
        shape = {
          ...src,
          text: value,
          color: state.activeTextarea.color,
          fontSize: state.activeTextarea.fontSize,
          fontFamily: state.activeTextarea.fontFamily,
          shadow: state.activeTextarea.shadow,
          x1: state.activeTextarea.backingX,
          y1: state.activeTextarea.backingY,
          width: backingWidth
        };
      } else {
        shape = {
          type: 'text',
          color: state.activeTextarea.color,
          fontSize: state.activeTextarea.fontSize,
          fontFamily: state.activeTextarea.fontFamily,
          shadow: state.activeTextarea.shadow,
          text: value,
          x1: state.activeTextarea.backingX,
          y1: state.activeTextarea.backingY,
          width: backingWidth
        };
      }
      // Re-inserting at the original index keeps z-order stable across a re-edit
      if (src && typeof state.activeTextarea.sourceIndex === 'number') {
        state.shapes.splice(state.activeTextarea.sourceIndex, 0, shape);
        state.undoStack.push({ type: 'replace', oldShape: src, newShape: shape });
      } else {
        state.shapes.push(shape);
        state.undoStack.push({ type: 'add', shape: shape });
      }
      clearRedoStack();
      updateUndoButton();
    } else if (src) {
      // Text cleared during a re-edit: leave the original removed (deletion)
      state.undoStack.push({ type: 'delete', shape: src, index: state.activeTextarea.sourceIndex || 0 });
      clearRedoStack();
      updateUndoButton();
    }

    cleanupTextarea();
    drawEverything();
  }

  function cancelActiveText() {
    // Restore the original shape if we were re-editing one
    if (state.activeTextarea && state.activeTextarea.source && typeof state.activeTextarea.sourceIndex === 'number') {
      state.shapes.splice(state.activeTextarea.sourceIndex, 0, state.activeTextarea.source);
      updateUndoButton();
    }
    cleanupTextarea();
    drawEverything();
  }

  function cleanupTextarea() {
    if (state.activeTextarea) {
      if (state.activeTextarea.cancelPendingResize) state.activeTextarea.cancelPendingResize();
      if (state.activeTextarea.resizeObserver) state.activeTextarea.resizeObserver.disconnect();
      if (state.activeTextarea.element.parentNode) {
        state.activeTextarea.element.parentNode.removeChild(state.activeTextarea.element);
      }
      state.activeTextarea = null;
    }
    updatePropertyPanelsVisibility();
    syncPropertyPanelToSelection();
  }

  return { cancelActiveText, commitActiveText, createTextarea };
}
