// The right-hand properties sidebar: the tool grid, the colour/stroke/fill/
// font controls, the My Colors palette, and keeping all of it pointed at the
// right thing.
//
// The panel has two modes and one set of controls. With nothing selected it
// edits the "for the next shape" settings on the state object; with a shape
// selected it edits that shape, showing only the controls its type honors.
// While a textarea is open it describes the textarea instead. syncFor* push
// values into the controls; apply* push them back out.

import { isHighlighterContext, resizeTextareaToContent, strokeWidthForTool }
  from './editor-behavior.mjs';
import { styleAppliesTo } from './editor-shapes.mjs';
import {
  normalizeHex,
  DEFAULT_FONT_FAMILY,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  HEX_COLOR_RE,
  MY_COLORS_KEY,
  MY_COLORS_MAX
} from './editor-state.mjs';

export function createPropertyPanel({
  canvas,
  state,
  drawEverything,
  fontWeightForFamily,
  showToast,
  // Supplied as thunks: history and the text editor are created after the
  // panel, because they need the sync functions it returns.
  clearRedoStack,
  updateUndoButton,
  commitActiveText
}) {
  const toolButtons = document.querySelectorAll('.tool-btn');
  const propColor = document.getElementById('prop-color');
  const propStroke = document.getElementById('prop-stroke');
  const propFill = document.getElementById('prop-fill');
  const propFont = document.getElementById('prop-font');
  const propAiLens = document.getElementById('prop-ai-lens');
  const colorSwatches = document.querySelectorAll('.color-swatch');
  const customColorPicker = document.getElementById('custom-color-picker');
  const customColorHex = document.getElementById('custom-color-hex');
  const myColorsPalette = document.getElementById('my-colors-palette');
  const myColorsAdd = document.getElementById('my-colors-add');
  const strokeButtons = document.querySelectorAll('.stroke-btn');
  const fillCheckbox = document.getElementById('fill-checkbox');
  const fillPalette = document.querySelector('.fill-palette');
  const fillSwatches = document.querySelectorAll('.fill-swatch');
  const fontSizeButtons = document.querySelectorAll('.font-size-btn');
  const fontSizeInput = document.getElementById('font-size-input');
  const fontFamilySelect = document.getElementById('font-family-select');
  const textShadowCheckbox = document.getElementById('text-shadow-checkbox');

  toolButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Commit pending text first if changing tools
      if (state.activeTextarea) {
        commitActiveText();
      }

      toolButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      state.activeTool = btn.dataset.tool;

      // Switching tools clears the selection and any hover cursor
      state.selectedShape = null;
      state.isDraggingShape = false;
      state.resizingHandleId = null;
      state.resizePrevProps = null;
      state.resizeAnchor = null;
      canvas.style.cursor = '';

      updatePropertyPanelsVisibility();
      syncPropertyPanelToSelection();
      if (state.activeTool === 'highlighter') {
        syncStrokeControls(Math.round(state.activeHighlighterLineWidth / 3));
      }
      drawEverything();
    });
  });

  // Dynamic UI feedback based on the chosen tool
  function updatePropertyPanelsVisibility() {
    // Hidden controls by default
    propColor.classList.remove('hidden');
    propStroke.classList.remove('hidden');
    propFill.classList.add('hidden');
    propFont.classList.add('hidden');
    propAiLens.classList.add('hidden');

    if (state.activeTextarea) {
      // While text is being edited, the controls describe that textarea,
      // even though its source shape is temporarily removed from `shapes`.
      propStroke.classList.add('hidden');
      propFont.classList.remove('hidden');
      return;
    }

    if (state.activeTool === 'select') {
      // With something selected the panel edits that shape, so show exactly
      // the controls its type honors; with nothing selected there is nothing
      // to style.
      const sel = (state.selectedShape && state.shapes.includes(state.selectedShape)) ? state.selectedShape : null;
      if (!sel) {
        propColor.classList.add('hidden');
        propStroke.classList.add('hidden');
        return;
      }
      if (!styleAppliesTo(sel, 'color')) propColor.classList.add('hidden');
      if (!styleAppliesTo(sel, 'lineWidth')) propStroke.classList.add('hidden');
      if (styleAppliesTo(sel, 'isFilled')) propFill.classList.remove('hidden');
      if (styleAppliesTo(sel, 'fontSize')) propFont.classList.remove('hidden');
    }
    else if (state.activeTool === 'blur') {
      propColor.classList.add('hidden');
      propStroke.classList.add('hidden');
    } 
    else if (state.activeTool === 'rect' || state.activeTool === 'ellipse') {
      propFill.classList.remove('hidden');
    }
    else if (state.activeTool === 'highlighter') {
      // Highlighter now shares the stroke width control with pen/arrow/rect.
    }
    else if (state.activeTool === 'text') {
      propStroke.classList.add('hidden');
      propFont.classList.remove('hidden');
    }
    else if (state.activeTool === 'ai-lens') {
      propColor.classList.add('hidden');
      propStroke.classList.add('hidden');
      propAiLens.classList.remove('hidden');
    }
  }

  // Applies the chosen color to the current selection (if any), to the
  // for-new-shapes state, and to any in-progress text edit.
  function applyActiveColor(color, coalesce) {
    if (state.activeTextarea) {
      state.activeTextarea.element.style.color = color;
      state.activeTextarea.color = color; // Commit must honor mid-edit changes
      if (!state.activeTextarea.source) state.activeColor = color;
    } else {
      state.activeColor = color;
    }

    applyStyleToSelection({ color: color }, coalesce);
  }

  // Clears the "active" state off every swatch and the custom picker so
  // exactly one control reflects the current active color at a time.
  // Queried live because My Colors slots are created at runtime.
  function deselectAllColorControls() {
    document.querySelectorAll('.color-swatch.active')
      .forEach(s => s.classList.remove('active'));
    if (customColorPicker) customColorPicker.classList.remove('active');
  }

  // Single activation path shared by the preset swatches and the runtime
  // My Colors slots, so both behave identically.
  function activateColorSwatch(swatch) {
    deselectAllColorControls();
    swatch.classList.add('active');
    applyActiveColor(swatch.dataset.color);
    if (customColorPicker && HEX_COLOR_RE.test(swatch.dataset.color)) {
      customColorPicker.value = normalizeHex(swatch.dataset.color);
    }

    // Clear any pending custom hex input now that a swatch won out.
    if (customColorHex) {
      customColorHex.value = '';
      customColorHex.classList.remove('invalid');
    }
  }

  // Color selection swatches
  colorSwatches.forEach(swatch => {
    swatch.addEventListener('click', () => activateColorSwatch(swatch));
  });

  // Custom color: native swatch picker
  if (customColorPicker) {
    const applyPickerColor = () => {
      deselectAllColorControls();
      customColorPicker.classList.add('active');
      applyActiveColor(customColorPicker.value, true); // Fires while dragging

      if (customColorHex) {
        customColorHex.value = customColorPicker.value;
        customColorHex.classList.remove('invalid');
      }
    };
    // Clicking an unchanged picker value still means "use this color"; color
    // inputs do not reliably emit input/change when the value stays the same.
    customColorPicker.addEventListener('click', applyPickerColor);
    customColorPicker.addEventListener('input', applyPickerColor);
    // 'change' fires when the picker closes: the drag gesture is over, so
    // the next picker use starts a fresh undo entry.
    customColorPicker.addEventListener('change', endStyleGesture);
  }

  // Custom color: hex text input, validated on Enter/change
  if (customColorHex) {
    const applyHexInput = () => {
      const value = customColorHex.value.trim();

      if (!HEX_COLOR_RE.test(value)) {
        customColorHex.classList.add('invalid');
        return;
      }

      customColorHex.classList.remove('invalid');
      deselectAllColorControls();
      if (customColorPicker) {
        customColorPicker.classList.add('active');
        customColorPicker.value = normalizeHex(value);
      }
      applyActiveColor(value);
    };

    customColorHex.addEventListener('change', applyHexInput);
    customColorHex.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        applyHexInput();
      }
    });
  }

  // ==========================================
  // My Colors: up to 6 remembered colors
  // ==========================================
  // Persisted as an array of hex strings under a single chrome.storage.local
  // key so a user's own palette (e.g. brand colors) survives sessions.

  function persistMyColors() {
    chrome.storage.local.set({ [MY_COLORS_KEY]: state.myColors });
  }

  // Mirrors the saved colors into the fill palette so a remembered color is
  // one click away for shape fills too.
  function renderMyColorFills() {
    if (!fillPalette) return;

    const previousActive = fillPalette.querySelector('.my-color-fill.active');
    const previousColor = previousActive ? previousActive.dataset.fillColor : null;
    fillPalette.querySelectorAll('.my-color-fill').forEach(el => el.remove());

    state.myColors.forEach(color => {
      const swatch = document.createElement('button');
      swatch.className = 'fill-swatch my-color-fill';
      swatch.dataset.fillColor = color;
      swatch.style.backgroundColor = color;
      swatch.title = `${color} (My Colors)`;
      swatch.addEventListener('click', () => activateFillSwatch(swatch));
      if (color === previousColor) swatch.classList.add('active');
      fillPalette.appendChild(swatch);
    });

    // The selected fill color was just removed from My Colors: fall back to
    // "Match Stroke" so the panel never shows an empty selection. UI state
    // only — going through activateFillSwatch here would restyle whatever
    // shape happens to be selected as a side effect of a palette removal.
    if (previousColor && !state.myColors.includes(previousColor)) {
      const matchStroke = fillPalette.querySelector('.fill-swatch.match-stroke');
      if (matchStroke) {
        document.querySelectorAll('.fill-swatch.active')
          .forEach(s => s.classList.remove('active'));
        matchStroke.classList.add('active');
        state.activeFillColor = null;
      }
    }
  }

  // Rebuilds the six slots; empty ones stay as dashed placeholders that also
  // act as "save the current color here".
  function renderMyColors() {
    if (!myColorsPalette) return;

    const previousActive = myColorsPalette.querySelector('.my-color-slot.active');
    const previousColor = previousActive ? previousActive.dataset.color : null;
    myColorsPalette.innerHTML = '';

    for (let i = 0; i < MY_COLORS_MAX; i++) {
      const color = state.myColors[i];
      const slot = document.createElement('button');
      slot.className = 'color-swatch my-color-slot';

      if (color) {
        slot.dataset.color = color;
        slot.style.backgroundColor = color;
        slot.title = `${color} — click to use, right-click to remove`;
        slot.addEventListener('click', () => activateColorSwatch(slot));
        slot.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          removeMyColor(color);
        });
        if (color === previousColor) slot.classList.add('active');
      } else {
        slot.classList.add('empty');
        slot.title = 'Empty slot — click to save the current color';
        slot.addEventListener('click', saveCurrentColor);
      }

      myColorsPalette.appendChild(slot);
    }

    if (previousColor && !state.myColors.includes(previousColor)) {
      syncColorControls(displayedStrokeColor());
    }

    renderMyColorFills();
  }

  function displayedStrokeColor() {
    if (state.activeTextarea) return state.activeTextarea.color;
    const sel = (state.activeTool === 'select' && state.selectedShape &&
                 state.shapes.includes(state.selectedShape) &&
                 styleAppliesTo(state.selectedShape, 'color'))
      ? state.selectedShape : null;
    return sel ? sel.color : state.activeColor;
  }

  // Saves the color the panel is currently DISPLAYING into the next free
  // slot: the selected shape's color when one is selected (the panel shows
  // that, not activeColor, which still holds the for-new-shapes value), the
  // active color otherwise. Once all six are full the oldest entry is
  // dropped (FIFO) so "+" always succeeds.
  function saveCurrentColor() {
    if (!state.myColorsLoaded) return; // Don't clobber storage before the load lands
    const color = normalizeHex(displayedStrokeColor()).toLowerCase();
    if (!HEX_COLOR_RE.test(color)) return;

    if (state.myColors.includes(color)) {
      showToast('That color is already in My Colors.');
      return;
    }

    state.myColors.push(color);
    if (state.myColors.length > MY_COLORS_MAX) state.myColors.shift();

    persistMyColors();
    renderMyColors();
  }

  function removeMyColor(color) {
    if (!state.myColorsLoaded) return;
    const index = state.myColors.indexOf(color);
    if (index === -1) return;

    state.myColors.splice(index, 1);
    persistMyColors();
    renderMyColors();
  }

  async function initMyColors() {
    try {
      const stored = await chrome.storage.local.get([MY_COLORS_KEY]);
      const saved = stored && stored[MY_COLORS_KEY];
      if (Array.isArray(saved)) {
        state.myColors = saved
          .filter(c => typeof c === 'string' && HEX_COLOR_RE.test(c))
          .slice(0, MY_COLORS_MAX);
      }
    } catch (err) {
      console.error('Failed to load My Colors:', err);
    }
    // Mutations are gated on this so a fast save can't overwrite storage
    // with the empty pre-load array (or be clobbered by the load landing).
    state.myColorsLoaded = true;
    renderMyColors();
  }

  if (myColorsAdd) {
    myColorsAdd.addEventListener('click', saveCurrentColor);
  }
  initMyColors();

  // Stroke line width options
  strokeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      strokeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const panelWidth = parseInt(btn.dataset.width, 10);
      const selected = (state.selectedShape && state.shapes.includes(state.selectedShape))
        ? state.selectedShape : null;
      if (isHighlighterContext(state.activeTool, selected)) {
        state.activeHighlighterLineWidth = strokeWidthForTool('highlighter', panelWidth);
      } else {
        state.activeLineWidth = panelWidth;
      }
      applyStyleToSelection({ lineWidth: panelWidth });
    });
  });

  // Live-rescale the active textarea to match the current active font size.
  function rescaleActiveTextarea() {
    if (!state.activeTextarea) return;
    const canvasRect = canvas.getBoundingClientRect();
    const displayFontScale = state.activeTextarea.fontSize * (canvasRect.width / canvas.width);
    state.activeTextarea.element.style.fontSize = `${displayFontScale}px`;
    resizeTextareaToContent(state.activeTextarea.element);
  }

  function applyTextFontSize(size, coalesce) {
    if (state.activeTextarea) {
      state.activeTextarea.fontSize = size;
      if (!state.activeTextarea.source) state.activeFontSize = size;
    } else {
      state.activeFontSize = size;
    }
    syncFontSizePresets(size);
    if (fontSizeInput) fontSizeInput.value = size;
    rescaleActiveTextarea();
    applyStyleToSelection({ fontSize: size }, coalesce);
  }

  // Highlight whichever quick-preset matches the current size (none if custom).
  function syncFontSizePresets(size) {
    fontSizeButtons.forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.size, 10) === size);
    });
  }

  // Quick preset buttons: fill the numeric input and rescale live text.
  fontSizeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      applyTextFontSize(parseInt(btn.dataset.size, 10), false);
    });
  });

  // Numeric font-size input: typing a custom value deselects the presets
  // (unless it happens to equal one) and drives the active font size live.
  if (fontSizeInput) {
    const applyFontSizeInput = (clampDisplay) => {
      let size = parseInt(fontSizeInput.value, 10);
      if (isNaN(size)) {
        if (!clampDisplay) return; // mid-typing empty/invalid: wait
        size = state.activeTextarea ? state.activeTextarea.fontSize : state.activeFontSize;
      }
      size = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, size));
      if (clampDisplay) fontSizeInput.value = size;
      // Typing fires per keystroke, so fold the whole edit into one undo step.
      applyTextFontSize(size, true);
    };

    fontSizeInput.addEventListener('input', () => applyFontSizeInput(false));
    fontSizeInput.addEventListener('change', () => applyFontSizeInput(true));
    // Leaving the field (change fires on commit/blur) ends the typing
    // burst; the next edit gets its own undo entry.
    fontSizeInput.addEventListener('change', endStyleGesture);
  }

  // Font family picker: updates state and previews on the active textarea.
  if (fontFamilySelect) {
    fontFamilySelect.addEventListener('change', () => {
      const family = fontFamilySelect.value;
      if (state.activeTextarea) {
        state.activeTextarea.element.style.fontFamily = family;
        state.activeTextarea.element.style.fontWeight = fontWeightForFamily(family);
        state.activeTextarea.fontFamily = family; // Commit must honor mid-edit changes
        if (!state.activeTextarea.source) state.activeFontFamily = family;
        resizeTextareaToContent(state.activeTextarea.element);
      } else {
        state.activeFontFamily = family;
      }
      applyStyleToSelection({ fontFamily: family });
    });
  }

  // Toggle solid fills
  fillCheckbox.addEventListener('change', (e) => {
    state.activeFill = e.target.checked;
    applyStyleToSelection({ isFilled: state.activeFill });
  });

  // Text shadow toggle: default off, per-shape, previewed live while editing.
  // Also restyles a selected text shape, like the other panel controls.
  if (textShadowCheckbox) {
    textShadowCheckbox.addEventListener('change', (e) => {
      const shadow = e.target.checked;
      if (state.activeTextarea) {
        state.activeTextarea.shadow = shadow;
        state.activeTextarea.element.style.textShadow =
          shadow ? '1.5px 1.5px rgba(0, 0, 0, 0.5)' : 'none';
        if (!state.activeTextarea.source) state.activeTextShadow = shadow;
      } else {
        state.activeTextShadow = shadow;
      }
      applyStyleToSelection({ shadow });
    });
  }

  // Independent fill color swatches (separate from the stroke color palette).
  // Queried live so the mirrored My Colors fill swatches take part too.
  function activateFillSwatch(swatch) {
    document.querySelectorAll('.fill-swatch.active')
      .forEach(s => s.classList.remove('active'));
    swatch.classList.add('active');
    // Empty data-fill-color means "match stroke" -> null
    state.activeFillColor = swatch.dataset.fillColor || null;
    applyStyleToSelection({ fillColor: state.activeFillColor });
  }

  fillSwatches.forEach(swatch => {
    swatch.addEventListener('click', () => activateFillSwatch(swatch));
  });

  // ==========================================
  // Properties Panel <-> Selected Shape
  // ==========================================

  // Continuous controls (number input, native color picker) coalesce their
  // per-event style entries into one undo step — but only within a single
  // gesture. Each control ends its gesture (on change/blur) by bumping this
  // token, so a NEW drag or typing burst never folds into an old entry and
  // Undo can't revert two unrelated edits at once.
  function endStyleGesture() {
    state.styleGestureId++;
  }

  // Restyle the current selection in place. `props` uses panel-level values;
  // properties the shape type ignores are dropped. Undoable as one
  // {type:'style'} entry. Pass coalesce=true for controls that fire
  // continuously so a single gesture doesn't bury the undo stack in
  // one-pixel steps (see styleGestureId in editor-state.mjs for the gesture bounds).
  function applyStyleToSelection(props, coalesce) {
    if (state.activeTool !== 'select') return;
    if (!state.selectedShape || !state.shapes.includes(state.selectedShape)) return;

    const shape = state.selectedShape;
    const prev = {};
    let changed = false;

    for (const key of Object.keys(props)) {
      if (!styleAppliesTo(shape, key)) continue;
      let value = props[key];
      // Highlighter strokes are stored at 3x the panel width (see the
      // highlighter branch in mousedown); keep that relationship on restyle.
      if (key === 'lineWidth' && shape.type === 'highlighter') value = value * 3;
      if (shape[key] === value) continue;
      prev[key] = shape[key];
      shape[key] = value;
      if (key === 'fontSize' && shape.type === 'text' &&
          Number.isFinite(shape.width) && shape.width > 0) {
        const minimumWidth = value * 2;
        if (shape.width < minimumWidth) {
          prev.width = shape.width;
          shape.width = minimumWidth;
        }
      }
      changed = true;
    }

    if (!changed) {
      drawEverything(); // Selection outline may still need refreshing
      return;
    }

    const top = state.undoStack[state.undoStack.length - 1];
    if (coalesce && top && top.type === 'style' && top.shape === shape &&
        top.gesture === state.styleGestureId) {
      // Fold into the in-progress gesture, keeping the oldest value per key.
      for (const key of Object.keys(prev)) {
        if (!(key in top.prev)) top.prev[key] = prev[key];
      }
    } else {
      state.undoStack.push({
        type: 'style', shape: shape, prev: prev,
        gesture: coalesce ? state.styleGestureId : null
      });
      clearRedoStack();
      updateUndoButton();
    }

    drawEverything();
  }

  // --- Panel <- shape (reflect properties of whatever is selected) ---

  function syncColorControls(color) {
    deselectAllColorControls();
    let matched = false;
    // Queried live so runtime-created My Colors slots can match too.
    document.querySelectorAll('.color-swatch').forEach(s => {
      if (matched) return;
      if (String(s.dataset.color).toLowerCase() === String(color).toLowerCase()) {
        s.classList.add('active');
        matched = true;
      }
    });
    if (customColorPicker && HEX_COLOR_RE.test(String(color))) {
      customColorPicker.value = normalizeHex(String(color));
    }
    if (!matched && customColorPicker) {
      customColorPicker.classList.add('active');
    }
    // Keep the hex field honest: show the custom color when the picker is
    // what's active, clear the stale text when a swatch matched instead.
    if (customColorHex) {
      customColorHex.value =
        (!matched && HEX_COLOR_RE.test(String(color))) ? normalizeHex(String(color)) : '';
      customColorHex.classList.remove('invalid');
    }
  }

  function syncStrokeControls(width) {
    strokeButtons.forEach(b => {
      b.classList.toggle('active', parseInt(b.dataset.width, 10) === width);
    });
  }

  function syncFillControls(isFilled, fillColor) {
    fillCheckbox.checked = !!isFilled;
    // Queried live so the mirrored My Colors fill swatches can match too.
    document.querySelectorAll('.fill-swatch').forEach(s => {
      s.classList.toggle('active', (s.dataset.fillColor || null) === (fillColor || null));
    });
  }

  function syncFontControls(size, family, shadow) {
    syncFontSizePresets(size);
    if (fontSizeInput) fontSizeInput.value = size;
    if (textShadowCheckbox) textShadowCheckbox.checked = !!shadow;
    if (fontFamilySelect) {
      // Only adopt families the picker actually offers, otherwise the select
      // would blank out on a shape drawn with a since-removed font.
      const known = Array.from(fontFamilySelect.options).some(o => o.value === family);
      if (known) fontFamilySelect.value = family;
    }
  }

  // Point the panel at the selected shape, or back at the active
  // for-new-shapes state when nothing is selected.
  function syncPropertyPanelToSelection() {
    const sel = (state.selectedShape && state.shapes.includes(state.selectedShape)) ? state.selectedShape : null;

    if (!sel) {
      syncColorControls(state.activeColor);
      const panelWidth = state.activeTool === 'highlighter'
        ? Math.round(state.activeHighlighterLineWidth / 3)
        : state.activeLineWidth;
      syncStrokeControls(panelWidth);
      syncFillControls(state.activeFill, state.activeFillColor);
      syncFontControls(state.activeFontSize, state.activeFontFamily, state.activeTextShadow);
      return;
    }

    if (styleAppliesTo(sel, 'color')) syncColorControls(sel.color);
    if (styleAppliesTo(sel, 'lineWidth')) {
      const width = sel.type === 'highlighter'
        ? Math.round((sel.lineWidth || 18) / 3)
        : (sel.lineWidth || 3);
      syncStrokeControls(width);
    }
    if (styleAppliesTo(sel, 'isFilled')) syncFillControls(sel.isFilled, sel.fillColor);
    if (styleAppliesTo(sel, 'fontSize')) {
      syncFontControls(sel.fontSize, sel.fontFamily || DEFAULT_FONT_FAMILY, sel.shadow);
    }
  }

  // Single entry point for changing the selection so the panel always
  // follows it. (editor-export.mjs deliberately bypasses this: it hides the
  // selection chrome for an export without touching the UI.)
  function setSelection(shape) {
    state.selectedShape = shape || null;
    updatePropertyPanelsVisibility();
    syncPropertyPanelToSelection();
  }

  return {
    setSelection,
    syncColorControls,
    syncFontControls,
    syncPropertyPanelToSelection,
    updatePropertyPanelsVisibility
  };
}
