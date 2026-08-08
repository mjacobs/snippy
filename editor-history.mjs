// Undo, Redo and Clear.
//
// Each undo entry describes one mutation (see editor-state.mjs for the
// shapes) so a single pass can revert adds, deletes, moves, restyles,
// reshapes, text re-edits and full clears. Style and reshape entries swap
// their stored values with the current ones on every pass, which is what lets
// the same entry drive both directions.

import { translateShape } from './editor-shapes.mjs';

export function createHistory({
  state,
  drawEverything,
  showToast,
  setSelection,
  updatePropertyPanelsVisibility,
  syncPropertyPanelToSelection,
  commitActiveText,
  cancelActiveText
}) {
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  const btnClear = document.getElementById('btn-clear');

  // Any new action invalidates the redo trail, since it no longer leads
  // back to a state Redo can reconstruct.
  function clearRedoStack() {
    state.redoStack = [];
    updateRedoButton();
  }

  function updateUndoButton() {
    btnUndo.disabled = state.undoStack.length === 0;
  }

  function updateRedoButton() {
    btnRedo.disabled = state.redoStack.length === 0;
  }

  // Undo last action (add, delete, move, text re-edit, or full clear)
  btnUndo.addEventListener('click', () => {
    if (state.activeTextarea) {
      cancelActiveText();
      return;
    }

    const entry = state.undoStack.pop();
    if (!entry) return;

    if (entry.type === 'add') {
      const idx = state.shapes.indexOf(entry.shape);
      if (idx !== -1) state.shapes.splice(idx, 1);
      if (state.selectedShape === entry.shape) state.selectedShape = null;
    }
    else if (entry.type === 'delete') {
      state.shapes.splice(Math.min(entry.index, state.shapes.length), 0, entry.shape);
    }
    else if (entry.type === 'move') {
      translateShape(entry.shape, -entry.dx, -entry.dy);
    }
    else if (entry.type === 'replace') {
      const idx = state.shapes.indexOf(entry.newShape);
      if (idx !== -1) state.shapes.splice(idx, 1, entry.oldShape);
      if (state.selectedShape === entry.newShape) state.selectedShape = null;
    }
    else if (entry.type === 'style' || entry.type === 'reshape') {
      // Swap current values into the entry so Redo can re-apply them; the
      // entry toggles between the two states on each undo/redo pass.
      const cur = {};
      for (const key of Object.keys(entry.prev)) cur[key] = entry.shape[key];
      Object.assign(entry.shape, entry.prev);
      entry.prev = cur;
    }
    else if (entry.type === 'clear') {
      state.shapes = [...entry.shapes];
      showToast('All annotations restored!');
    }

    // The same entry re-applies forward when Redo is pressed next.
    state.redoStack.push(entry);

    updateUndoButton();
    updateRedoButton();
    // The selection (and therefore what the panel is editing) may have
    // changed or been restyled by the undo.
    updatePropertyPanelsVisibility();
    syncPropertyPanelToSelection();
    drawEverything();
  });

  // Redo the last undone action, re-applying the original mutation
  btnRedo.addEventListener('click', () => {
    if (state.activeTextarea) {
      cancelActiveText();
      return;
    }

    const entry = state.redoStack.pop();
    if (!entry) return;

    if (entry.type === 'add') {
      state.shapes.push(entry.shape);
    }
    else if (entry.type === 'delete') {
      const idx = state.shapes.indexOf(entry.shape);
      if (idx !== -1) state.shapes.splice(idx, 1);
      if (state.selectedShape === entry.shape) state.selectedShape = null;
    }
    else if (entry.type === 'move') {
      translateShape(entry.shape, entry.dx, entry.dy);
    }
    else if (entry.type === 'replace') {
      const idx = state.shapes.indexOf(entry.oldShape);
      if (idx !== -1) state.shapes.splice(idx, 1, entry.newShape);
      if (state.selectedShape === entry.oldShape) state.selectedShape = null;
    }
    else if (entry.type === 'style' || entry.type === 'reshape') {
      // Same swap as in Undo: re-apply the stored values, keep the ones
      // being replaced so the next Undo can restore them.
      const cur = {};
      for (const key of Object.keys(entry.prev)) cur[key] = entry.shape[key];
      Object.assign(entry.shape, entry.prev);
      entry.prev = cur;
    }
    else if (entry.type === 'clear') {
      state.shapes = [];
      setSelection(null); // The selected shape (if any) was just wiped
    }

    // Re-push onto the undo stack so it can be undone again.
    state.undoStack.push(entry);

    updateUndoButton();
    updateRedoButton();
    updatePropertyPanelsVisibility();
    syncPropertyPanelToSelection();
    drawEverything();
  });

  // Clear all annotations instantly
  btnClear.addEventListener('click', () => {
    // Close any in-progress text edit first so commit/cancel can't
    // resurrect a shape that Clear already wiped.
    if (state.activeTextarea) commitActiveText();
    if (state.shapes.length === 0) return;

    state.undoStack.push({ type: 'clear', shapes: [...state.shapes] });
    clearRedoStack();
    state.shapes = [];
    setSelection(null);

    updateUndoButton();
    drawEverything();
    showToast('Annotations cleared. Press Undo to restore.');
  });

  return { clearRedoStack, updateRedoButton, updateUndoButton };
}
