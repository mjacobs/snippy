// Snippy Image Editor

import { consumeCapture } from './capture-workflow.mjs';
import { toolActionForTextHit } from './editor-behavior.mjs';
import { createAiLens } from './editor-ai-lens.mjs';
import { createRenderer } from './editor-canvas.mjs';
import { createExport } from './editor-export.mjs';
import { createHistory } from './editor-history.mjs';
import { createPropertyPanel } from './editor-panel.mjs';
import { createTextEditor } from './editor-text.mjs';
import { initSidebarResize } from './editor-sidebar.mjs';
import { createEditorState } from './editor-state.mjs';
import { createTextEditHint, createToast } from './editor-toast.mjs';
import {
  anchorForBoxHandle,
  isBoxHandle,
  moveHandleTo,
  normalizeBoxCoords,
  translateShape
} from './editor-shapes.mjs';
import { sanitizeSourceUrl } from './editor-metadata.mjs';

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const canvas = document.getElementById('editor-canvas');
  const canvasWrapper = document.getElementById('canvas-wrapper');
  const imgDimensions = document.getElementById('image-dimensions');
  
  // Action buttons
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  const btnCopy = document.getElementById('btn-copy');
  const btnSave = document.getElementById('btn-save');
  
  // The tool grid and every property control belong to editor-panel.mjs,
  // which looks them up itself.

  // Toast. Created up here rather than beside its other helpers because the
  // capture load below can toast before the rest of this function body runs
  // (everything after the first `await` is deferred).
  const showToast = createToast(document.getElementById('toast'));
  const maybeShowTextEditHint = createTextEditHint(showToast);

  // Canvas context
  const ctx = canvas.getContext('2d');
  
  // Editor State. One shared, sealed object (see editor-state.mjs) so the
  // annotation modules can read and write the same values this file does.
  const state = createEditorState();

  // Rendering lives in editor-canvas.mjs; it closes over the canvas and the
  // shared state, so these read exactly as the local functions used to.
  const {
    drawEverything,
    drawShape,
    fontWeightForFamily,
    getBackingCoords,
    getClientCoords,
    getHandles,
    getShapeBBox,
    handleRadius,
    hitTestShape,
    setupCanvas
  } = createRenderer({ canvas, ctx, state, imgDimensions });

  // The properties sidebar. Created before history and the text editor
  // because both need its sync functions; what it needs from them comes back
  // as thunks, resolved when a control is actually used.
  const {
    setSelection,
    syncColorControls,
    syncFontControls,
    syncPropertyPanelToSelection,
    updatePropertyPanelsVisibility
  } = createPropertyPanel({
    canvas,
    state,
    drawEverything,
    fontWeightForFamily,
    showToast,
    clearRedoStack: () => clearRedoStack(),
    updateUndoButton: () => updateUndoButton(),
    commitActiveText: () => commitActiveText()
  });

  // Undo / Redo / Clear. Created before the text editor because that takes
  // clearRedoStack and updateUndoButton; the two text functions come back the
  // other way, so they are passed as thunks that resolve when a button is
  // actually clicked.
  const { clearRedoStack, updateRedoButton, updateUndoButton } = createHistory({
    state,
    drawEverything,
    showToast,
    setSelection,
    updatePropertyPanelsVisibility,
    syncPropertyPanelToSelection,
    commitActiveText: () => commitActiveText(),
    cancelActiveText: () => cancelActiveText()
  });

  // 1. Load active screenshot from storage
  try {
    const capture = await consumeCapture(chrome.storage.local, globalThis.location.search);
    if (capture && capture.sourceUrl) {
      state.sourceUrl = sanitizeSourceUrl(capture.sourceUrl);
    }
    if (capture && capture.dataUrl) {
      state.bgImage = new Image();
      state.bgImage.onload = () => {
        setupCanvas();
      };
      state.bgImage.src = capture.dataUrl;
    } else {
      showToast('No screenshot found. Draw a crop box on a webpage first!');
    }
  } catch (err) {
    console.error('Failed to load active screenshot:', err);
    showToast('Error loading screenshot.');
  }

  // Topmost shape at a point (iterate from end), or null
  function getShapeAt(x, y) {
    for (let i = state.shapes.length - 1; i >= 0; i--) {
      if (hitTestShape(state.shapes[i], x, y)) return state.shapes[i];
    }
    return null;
  }

  // Text lookup deliberately ignores any transient drawing that may sit on
  // top of the text during the two clicks of a double-click gesture.
  function getTextShapeAt(x, y) {
    for (let i = state.shapes.length - 1; i >= 0; i--) {
      if (state.shapes[i].type === 'text' && hitTestShape(state.shapes[i], x, y)) {
        return state.shapes[i];
      }
    }
    return null;
  }

  // ==========================================
  // Select Tool: Reshape Handles
  // ==========================================

  // Handle under the point on the currently selected shape, or null. Handles
  // win over the shape body, so a corner grab resizes rather than moves.
  function getHandleAt(x, y) {
    if (state.activeTool !== 'select') return null;
    if (!state.selectedShape || !state.shapes.includes(state.selectedShape)) return null;
    const r = handleRadius() + 3;
    for (const h of getHandles(state.selectedShape)) {
      if (Math.hypot(x - h.x, y - h.y) <= r) return h;
    }
    return null;
  }

  // Remove the selected shape (Delete/Backspace); undoable
  function deleteSelectedShape() {
    if (!state.selectedShape) return;
    const idx = state.shapes.indexOf(state.selectedShape);
    if (idx !== -1) {
      state.shapes.splice(idx, 1);
      state.undoStack.push({ type: 'delete', shape: state.selectedShape, index: idx });
      clearRedoStack();
    }
    setSelection(null);
    updateUndoButton();
    drawEverything();
  }

  // ==========================================
  // Mouse Event Handlers on Canvas
  // ==========================================

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Left click only
    if (!state.bgImage) return;

    // Close any active textarea first if user clicked elsewhere
    if (state.activeTextarea) {
      commitActiveText();
      return;
    }

    const pointer = getBackingCoords(e.clientX, e.clientY);
    const textHit = getTextShapeAt(pointer.x, pointer.y);
    const textHitPolicy = toolActionForTextHit(state.activeTool, e.detail, !!textHit);
    if (textHitPolicy === 'suppress') {
      // Reserve clicks on existing text for the dblclick handler. This keeps
      // Text from placing a textarea over the second click and prevents other
      // drawing tools from starting a second annotation in the sequence.
      return;
    }
    if (textHitPolicy === 'track') {
      state.doubleClickCandidate = {
        target: textHit,
        artifact: null,
        redoStack: [...state.redoStack],
        startedAt: Date.now()
      };
    } else if (e.detail <= 1) {
      state.doubleClickCandidate = null;
    }

    if (state.activeTool === 'ai-lens') {
      return; // AI Lens has no canvas drawing behavior
    }

    if (state.activeTool === 'select') {
      // Select the topmost shape under the cursor, or deselect on empty canvas.
      const sc = pointer;
      // A handle on the current selection wins over the shape body.
      const handle = getHandleAt(sc.x, sc.y);
      if (handle) {
        state.resizingHandleId = handle.id;
        state.resizePrevProps = handle.id === 'text-e'
          ? { width: state.selectedShape.width }
          : {
              x1: state.selectedShape.x1,
              y1: state.selectedShape.y1,
              x2: state.selectedShape.x2,
              y2: state.selectedShape.y2
            };
        // Box handles: pin the opposite corner NOW. Deriving it per
        // mousemove re-inspects the (mutating) coords, so once the pointer
        // crossed the opposite edge the formerly fixed corner would start
        // moving too and the shape would jump.
        if (isBoxHandle(handle.id)) {
          state.resizeAnchor = anchorForBoxHandle(getShapeBBox(state.selectedShape), handle.id);
        } else {
          state.resizeAnchor = null;
        }
        return;
      }

      const hit = getShapeAt(sc.x, sc.y);
      if (hit) {
        setSelection(hit);
        state.isDraggingShape = true;
        state.dragLastX = sc.x;
        state.dragLastY = sc.y;
        state.dragTotalDX = 0;
        state.dragTotalDY = 0;
        if (hit.type === 'text') maybeShowTextEditHint();
      } else {
        setSelection(null);
      }
      drawEverything();
      return;
    }

    // Any new drawing action clears the current selection.
    setSelection(null);

    const coords = pointer;
    state.startX = coords.x;
    state.startY = coords.y;
    state.currentX = coords.x;
    state.currentY = coords.y;

    if (state.activeTool === 'text') {
      // Stop the default mousedown focus shift from blurring the textarea
      // that createTextarea focuses.
      e.preventDefault();
      createTextarea(e.clientX, e.clientY, coords.x, coords.y);
      return;
    }

    state.isDrawing = true;

    // Initialize shapes
    if (state.activeTool === 'pen' || state.activeTool === 'highlighter') {
      // Highlighter shares the pen's Thin/Medium/Thick stroke control, but
      // scaled up 3x so its brush stays visibly broader than the pen's at
      // every setting (Medium/6 preserves the old fixed 18px look).
      const resolvedLineWidth = state.activeTool === 'highlighter'
        ? state.activeHighlighterLineWidth
        : state.activeLineWidth;
      state.currentShape = {
        type: state.activeTool,
        color: state.activeColor,
        lineWidth: resolvedLineWidth,
        points: [{ x: state.startX, y: state.startY }]
      };
    }
    else if (state.activeTool === 'rect') {
      state.currentShape = {
        type: 'rect',
        color: state.activeColor,
        lineWidth: state.activeLineWidth,
        x1: state.startX,
        y1: state.startY,
        x2: state.startX,
        y2: state.startY,
        isFilled: state.activeFill,
        fillColor: state.activeFillColor
      };
    }
    else if (state.activeTool === 'ellipse') {
      state.currentShape = {
        type: 'ellipse',
        color: state.activeColor,
        lineWidth: state.activeLineWidth,
        x1: state.startX,
        y1: state.startY,
        x2: state.startX,
        y2: state.startY,
        isFilled: state.activeFill,
        fillColor: state.activeFillColor
      };
    }
    else if (state.activeTool === 'arrow') {
      state.currentShape = {
        type: 'arrow',
        color: state.activeColor,
        lineWidth: state.activeLineWidth,
        x1: state.startX,
        y1: state.startY,
        x2: state.startX,
        y2: state.startY
      };
    } 
    else if (state.activeTool === 'blur') {
      state.currentShape = {
        type: 'blur',
        x1: state.startX,
        y1: state.startY,
        x2: state.startX,
        y2: state.startY
      };
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!state.isDrawing || !state.currentShape) return;

    const coords = getBackingCoords(e.clientX, e.clientY);
    state.currentX = coords.x;
    state.currentY = coords.y;

    if (state.currentShape.type === 'pen' || state.currentShape.type === 'highlighter') {
      state.currentShape.points.push({ x: state.currentX, y: state.currentY });
    } else {
      state.currentShape.x2 = state.currentX;
      state.currentShape.y2 = state.currentY;
    }

    // Live preview
    drawEverything();
    drawShape(state.currentShape);
  });

  window.addEventListener('mouseup', (e) => {
    if (!state.isDrawing) return;
    state.isDrawing = false;

    if (!state.currentShape) return;

    const coords = getBackingCoords(e.clientX, e.clientY);
    state.currentX = coords.x;
    state.currentY = coords.y;

    if (state.currentShape.type === 'pen' || state.currentShape.type === 'highlighter') {
      state.currentShape.points.push({ x: state.currentX, y: state.currentY });
    } else {
      state.currentShape.x2 = state.currentX;
      state.currentShape.y2 = state.currentY;
    }

    // Verify size / validity threshold to discard click mistakes
    let isValid = false;
    if (state.currentShape.type === 'pen' || state.currentShape.type === 'highlighter') {
      isValid = state.currentShape.points.length > 2;
    } else {
      const distance = Math.sqrt(
        Math.pow(state.currentShape.x2 - state.currentShape.x1, 2) + 
        Math.pow(state.currentShape.y2 - state.currentShape.y1, 2)
      );
      isValid = distance > 4; // At least 4px dragging vector
    }

    if (isValid) {
      state.shapes.push(state.currentShape);
      state.undoStack.push({ type: 'add', shape: state.currentShape });
      if (state.doubleClickCandidate &&
          Date.now() - state.doubleClickCandidate.startedAt < 1000) {
        state.doubleClickCandidate.artifact = state.currentShape;
      }
      clearRedoStack();
      updateUndoButton();
    }

    state.currentShape = null;
    drawEverything();
  });

  // Select-tool reshape drag (handles), kept ahead of drag-to-move so the
  // two never run for the same gesture.
  window.addEventListener('mousemove', (e) => {
    if (!state.resizingHandleId || !state.selectedShape) return;
    const coords = getBackingCoords(e.clientX, e.clientY);
    if (state.resizeAnchor) {
      // Box resize: fixed corner stays pinned, dragged corner follows the
      // pointer. Coords may be inverted mid-drag; normalized on mouseup.
      state.selectedShape.x1 = state.resizeAnchor.x;
      state.selectedShape.y1 = state.resizeAnchor.y;
      state.selectedShape.x2 = coords.x;
      state.selectedShape.y2 = coords.y;
    } else {
      moveHandleTo(state.selectedShape, state.resizingHandleId, coords.x, coords.y);
    }
    drawEverything();
  });

  window.addEventListener('mouseup', () => {
    if (!state.resizingHandleId) return;
    const shape = state.selectedShape;
    const prev = state.resizePrevProps;
    state.resizingHandleId = null;
    state.resizePrevProps = null;
    state.resizeAnchor = null;
    if (!shape || !prev) return;

    normalizeBoxCoords(shape);

    const changed = Object.keys(prev).some(key => shape[key] !== prev[key]);
    if (changed) {
      // Its own type (not 'style') so a following restyle can't coalesce
      // into it; undo restores the saved coords either way.
      state.undoStack.push({ type: 'reshape', shape, prev });
      clearRedoStack();
      updateUndoButton();
    }
    drawEverything();
  });

  // Select-tool drag-to-move (kept separate from the drawing path above)
  window.addEventListener('mousemove', (e) => {
    if (!state.isDraggingShape || !state.selectedShape) return;
    const coords = getBackingCoords(e.clientX, e.clientY);
    const dx = coords.x - state.dragLastX;
    const dy = coords.y - state.dragLastY;
    if (dx !== 0 || dy !== 0) {
      translateShape(state.selectedShape, dx, dy);
      state.dragTotalDX += dx;
      state.dragTotalDY += dy;
      state.dragLastX = coords.x;
      state.dragLastY = coords.y;
      drawEverything();
    }
  });

  window.addEventListener('mouseup', () => {
    if (!state.isDraggingShape) return;
    state.isDraggingShape = false;
    // Record the whole drag as one undoable move
    if (state.selectedShape && (state.dragTotalDX !== 0 || state.dragTotalDY !== 0)) {
      state.undoStack.push({ type: 'move', shape: state.selectedShape, dx: state.dragTotalDX, dy: state.dragTotalDY });
      clearRedoStack();
      updateUndoButton();
    }
    state.dragTotalDX = 0;
    state.dragTotalDY = 0;
  });

  // Cursor feedback in Select mode: a resize cursor over a reshape handle,
  // 'text' over a text shape (hints it can be double-clicked to edit),
  // 'move' over any other shape body.
  canvas.addEventListener('mousemove', (e) => {
    if (state.activeTool !== 'select' || state.isDraggingShape || state.resizingHandleId) return;
    const coords = getBackingCoords(e.clientX, e.clientY);
    const handle = getHandleAt(coords.x, coords.y);
    if (handle) {
      canvas.style.cursor = handle.cursor;
      return;
    }
    const hit = getShapeAt(coords.x, coords.y);
    canvas.style.cursor = hit ? (hit.type === 'text' ? 'text' : 'move') : 'default';
  });

  // Double-click a text shape to re-open it for editing regardless of the
  // active tool. The mousedown path reserves the second click; if the first
  // click produced a small annotation, remove that artifact before hit-testing
  // the underlying text.
  canvas.addEventListener('dblclick', (e) => {
    if (state.activeTextarea) commitActiveText();
    const coords = getBackingCoords(e.clientX, e.clientY);
    const hit = getTextShapeAt(coords.x, coords.y);
    if (hit) {
      const candidate = state.doubleClickCandidate;
      if (candidate && candidate.target === hit && candidate.artifact &&
          Date.now() - candidate.startedAt < 1000) {
        const artifactIndex = state.shapes.indexOf(candidate.artifact);
        if (artifactIndex !== -1) state.shapes.splice(artifactIndex, 1);
        for (let i = state.undoStack.length - 1; i >= 0; i--) {
          const entry = state.undoStack[i];
          if (entry.type === 'add' && entry.shape === candidate.artifact) {
            state.undoStack.splice(i, 1);
            break;
          }
        }
        state.redoStack = candidate.redoStack;
        updateUndoButton();
        updateRedoButton();
      }
      state.doubleClickCandidate = null;
      state.isDrawing = false;
      state.currentShape = null;
      const idx = state.shapes.indexOf(hit);
      if (idx !== -1) state.shapes.splice(idx, 1);
      setSelection(null);
      const client = getClientCoords(hit.x1, hit.y1);
      createTextarea(client.x, client.y, hit.x1, hit.y1, hit, idx);
      drawEverything();
    }
  });

  // In-place text editing lives in editor-text.mjs. It drives the property
  // panel while a textarea is open (the panel then describes the textarea,
  // not the selection), so it takes the sync functions as callbacks.
  const { cancelActiveText, commitActiveText, createTextarea } =
    createTextEditor({
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
    });

  // Copy / Save / Save+Path live in editor-export.mjs. They need to redraw
  // without the selection outline before snapshotting the canvas, so they
  // take drawEverything.
  createExport({ canvas, state, drawEverything, showToast, commitActiveText });

  // AI Lens side panel (Gemini AI Studio / Vertex AI). It owns its own
  // elements and credentials; all it needs from here is the canvas to
  // photograph and a way to close any open text edit first.
  createAiLens({ canvas, state, showToast, commitActiveText });

  // ==========================================
  // Keyboard Shortcuts
  // ==========================================
  
  window.addEventListener('keydown', (e) => {
    // Don't trigger shortcuts while typing in any form control — Delete in
    // the hex field or font-size input must edit text, not annotations.
    const el = document.activeElement;
    if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' ||
               el.tagName === 'SELECT' || el.isContentEditable)) {
      return;
    }

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const ctrlKey = isMac ? e.metaKey : e.ctrlKey;

    if (ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      btnRedo.click();
    }
    else if (ctrlKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      btnUndo.click();
    }
    else if (ctrlKey && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      btnRedo.click();
    }
    else if (ctrlKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      btnCopy.click();
    } 
    else if (ctrlKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      btnSave.click();
    } 
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      // Remove the selected shape (guarded above against textarea focus)
      if (state.selectedShape) {
        e.preventDefault();
        deleteSelectedShape();
      }
    }
    else if (e.key === 'Escape') {
      if (state.selectedShape) {
        // A reshape or move may be mid-gesture: revert it first, otherwise
        // clearing the selection strands a mutation no undo entry records.
        if (state.resizingHandleId && state.resizePrevProps) {
          Object.assign(state.selectedShape, state.resizePrevProps);
        }
        if (state.isDraggingShape && (state.dragTotalDX !== 0 || state.dragTotalDY !== 0)) {
          translateShape(state.selectedShape, -state.dragTotalDX, -state.dragTotalDY);
        }
        state.resizingHandleId = null;
        state.resizePrevProps = null;
        state.resizeAnchor = null;
        state.isDraggingShape = false;
        state.dragTotalDX = 0;
        state.dragTotalDY = 0;
        // First Escape just clears the selection
        setSelection(null);
        drawEverything();
      } else {
        // Otherwise fall back to switching to the Select tool (by id — its
        // position in the grid is a layout choice, not a contract)
        document.getElementById('tool-select').click();
      }
    }
  });

  initSidebarResize(chrome.storage.local);

});
