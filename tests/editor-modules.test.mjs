// Smoke test for the editor modules that need a DOM.
//
// These modules were cut out of one big closure, so the failure mode that
// matters is a reference that no longer resolves — a name the factory forgot
// to take, or one used before it is initialized. Regex-reading the source
// cannot settle that; running it can. So: stub just enough of the browser to
// import each module, call its factory, and fire the listeners it registered.
//
// Nothing here asserts pixels or layout. It asserts that the code runs.

import test from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------- DOM stub

function makeElement(tag = 'div') {
  const listeners = new Map();
  const el = {
    tagName: tag.toUpperCase(),
    dataset: {},
    style: {},
    value: '',
    textContent: '',
    innerHTML: '',
    placeholder: '',
    href: '',
    title: '',
    checked: false,
    disabled: false,
    clientWidth: 200,
    scrollHeight: 30,
    isConnected: true,
    parentNode: null,
    options: [],
    children: [],
    classList: {
      _set: new Set(),
      add(...c) { c.forEach(x => this._set.add(x)); },
      remove(...c) { c.forEach(x => this._set.delete(x)); },
      toggle(c, on) { if (on === undefined) { this._set.has(c) ? this._set.delete(c) : this._set.add(c); } else if (on) { this._set.add(c); } else { this._set.delete(c); } },
      contains(c) { return this._set.has(c); }
    },
    listeners,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const fns = listeners.get(type) || [];
      const i = fns.indexOf(fn);
      if (i !== -1) fns.splice(i, 1);
    },
    // Fire every handler for `type`; returns how many ran.
    fire(type, event = {}) {
      const fns = listeners.get(type) || [];
      for (const fn of fns) fn({ preventDefault() {}, stopPropagation() {}, target: el, ...event });
      return fns.length;
    },
    appendChild(child) { el.children.push(child); child.parentNode = el; return child; },
    removeChild(child) { child.parentNode = null; return child; },
    querySelector() { return makeElement(); },
    querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 300 }; },
    focus() {},
    click() { el.fire('click'); },
    remove() {},
    toBlob(cb) { cb(null); },
    toDataURL() { return 'data:image/jpeg;base64,AAAA'; },
    getContext() { return makeContext(); },
    width: 800,
    height: 600
  };
  return el;
}

// A bare addEventListener/removeEventListener/fire target, for globals like
// `window` that register handlers but aren't themselves DOM elements.
function makeEventTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener(type, fn) {
      const fns = listeners.get(type) || [];
      const i = fns.indexOf(fn);
      if (i !== -1) fns.splice(i, 1);
    },
    fire(type, event = {}) {
      const fns = listeners.get(type) || [];
      for (const fn of fns) fn({ preventDefault() {}, stopPropagation() {}, ...event });
      return fns.length;
    }
  };
}

function makeContext() {
  const noop = () => {};
  return {
    save: noop, restore: noop, beginPath: noop, moveTo: noop, lineTo: noop,
    closePath: noop, stroke: noop, fill: noop, arc: noop, ellipse: noop,
    strokeRect: noop, fillRect: noop, clearRect: noop, fillText: noop,
    drawImage: noop, setLineDash: noop,
    measureText: (t) => ({ width: String(t).length * 10 })
  };
}

// Selectors the editor queries for a *group* of controls, with the dataset
// each carries. Returning real nodes here means the panel actually registers
// its click handlers, so the tests can fire them.
const GROUPS = {
  '.tool-btn': [{ tool: 'pen' }, { tool: 'select' }],
  '.color-swatch': [{ color: '#00ff00' }, { color: '#0000ff' }],
  '.stroke-btn': [{ width: '3' }, { width: '6' }],
  '.font-size-btn': [{ size: '16' }, { size: '48' }],
  '.fill-swatch': [{ fillColor: '' }, { fillColor: '#ff00ff' }],
  '.ai-action-btn': [{ action: 'ocr' }, { action: 'explain' }]
};

function installDom() {
  const registry = new Map();
  const groups = new Map();
  const selectors = new Map();
  const get = (id) => {
    if (!registry.has(id)) registry.set(id, makeElement());
    return registry.get(id);
  };
  const getAll = (selector) => {
    if (!groups.has(selector)) {
      const spec = GROUPS[selector] || [];
      groups.set(selector, spec.map(dataset => Object.assign(makeElement('button'), { dataset })));
    }
    return groups.get(selector);
  };
  // Memoized by selector (like getElementById/getAll above) so a module that
  // looks a node up once and a test that looks it up again to make
  // assertions get the same stub instance back.
  const querySelector = (selector) => {
    if (!selectors.has(selector)) selectors.set(selector, makeElement());
    return selectors.get(selector);
  };
  const doc = {
    getElementById: get,
    querySelector,
    querySelectorAll: getAll,
    createElement: (tag) => makeElement(tag),
    addEventListener: () => {},
    body: makeElement('body'),
    fonts: { ready: Promise.resolve() },
    activeElement: null
  };
  globalThis.__groups = getAll;
  globalThis.document = doc;
  globalThis.window = Object.assign(makeEventTarget(), {
    getComputedStyle: () => ({
      paddingLeft: '4px', paddingRight: '4px', paddingTop: '4px',
      borderLeftWidth: '1px', borderRightWidth: '1px', borderTopWidth: '1px',
      boxSizing: 'border-box'
    })
  });
  globalThis.localStorage = {
    _d: new Map(),
    getItem(k) { return this._d.get(k) ?? null; },
    setItem(k, v) { this._d.set(k, v); }
  };
  // Node defines navigator as a getter-only global, so redefine it.
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { clipboard: { writeText: async () => {}, write: async () => {} } }
  });
  const store = new Map();
  globalThis.chrome = {
    storage: {
      local: {
        async get(keys) {
          if (typeof keys === 'function') return {};
          const out = {};
          for (const k of [].concat(keys || [])) if (store.has(k)) out[k] = store.get(k);
          return out;
        },
        set(obj, cb) { for (const [k, v] of Object.entries(obj)) store.set(k, v); if (cb) cb(); },
        remove(keys) { for (const k of [].concat(keys)) store.delete(k); }
      }
    },
    downloads: { download() {}, search() {}, onChanged: { addListener() {}, removeListener() {} } },
    runtime: { sendMessage() {}, lastError: null }
  };
  return { registry, doc };
}

installDom();

const { createRenderer } = await import('../editor-canvas.mjs');
const { createHistory } = await import('../editor-history.mjs');
const { createTextEditor } = await import('../editor-text.mjs');
const { createExport } = await import('../editor-export.mjs');
const { createAiLens } = await import('../editor-ai-lens.mjs');
const { createPropertyPanel } = await import('../editor-panel.mjs');
const { createToast, createTextEditHint } = await import('../editor-toast.mjs');
const { initSidebarResize } = await import('../editor-sidebar.mjs');
const { createEditorState } = await import('../editor-state.mjs');

function freshEditor() {
  const state = createEditorState();
  const canvas = makeElement('canvas');
  const ctx = makeContext();
  const renderer = createRenderer({
    canvas, ctx, state, imgDimensions: makeElement()
  });
  return { state, canvas, ctx, renderer };
}

test('createEditorState is sealed against typo\'d field names', () => {
  const state = createEditorState();
  state.activeTool = 'pen'; // a real field still assigns
  assert.equal(state.activeTool, 'pen');
  assert.throws(() => { state.activeTooll = 'pen'; }, TypeError);
});

test('the renderer draws every shape type without a live canvas', () => {
  const { state, renderer } = freshEditor();
  state.bgImage = { naturalWidth: 800, naturalHeight: 600 };
  renderer.setupCanvas();

  state.shapes = [
    { type: 'pen', color: '#f00', lineWidth: 3, points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] },
    { type: 'highlighter', color: '#ff0', lineWidth: 18, points: [{ x: 0, y: 0 }, { x: 9, y: 9 }] },
    { type: 'rect', color: '#0f0', lineWidth: 3, x1: 0, y1: 0, x2: 20, y2: 20, isFilled: true },
    { type: 'ellipse', color: '#0f0', lineWidth: 3, x1: 0, y1: 0, x2: 20, y2: 20, isFilled: false },
    { type: 'arrow', color: '#00f', lineWidth: 3, x1: 0, y1: 0, x2: 30, y2: 30 },
    { type: 'blur', x1: 0, y1: 0, x2: 40, y2: 40 },
    { type: 'text', color: '#fff', fontSize: 24, text: 'hello there', x1: 10, y1: 10, width: 60, shadow: true }
  ];
  // A selected shape adds the outline and handle pass on top.
  state.activeTool = 'select';
  state.selectedShape = state.shapes[2];
  renderer.drawEverything();

  // And with each type selected in turn, so every getHandles branch runs.
  for (const shape of state.shapes) {
    state.selectedShape = shape;
    renderer.drawEverything();
    renderer.getShapeBBox(shape);
    renderer.hitTestShape(shape, 5, 5);
  }
});

test('the renderer converts between viewport and backing coordinates', () => {
  const { renderer } = freshEditor();
  // Stub canvas: 800x600 backing shown at 400x300, so a 2x scale factor.
  assert.deepEqual(renderer.getBackingCoords(10, 10), { x: 20, y: 20 });
  assert.deepEqual(renderer.getClientCoords(20, 20), { x: 10, y: 10 });
});

test('undo and redo round-trip every kind of history entry', () => {
  const { state, renderer } = freshEditor();
  state.bgImage = { naturalWidth: 8, naturalHeight: 6 };
  const noop = () => {};
  const history = createHistory({
    state,
    drawEverything: renderer.drawEverything,
    showToast: noop,
    setSelection: (s) => { state.selectedShape = s || null; },
    updatePropertyPanelsVisibility: noop,
    syncPropertyPanelToSelection: noop,
    commitActiveText: noop,
    cancelActiveText: noop
  });

  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');

  const rect = { type: 'rect', color: '#f00', lineWidth: 3, x1: 0, y1: 0, x2: 10, y2: 10 };

  // add
  state.shapes.push(rect);
  state.undoStack.push({ type: 'add', shape: rect });
  history.updateUndoButton();
  assert.equal(btnUndo.disabled, false);
  btnUndo.fire('click');
  assert.equal(state.shapes.length, 0);
  btnRedo.fire('click');
  assert.equal(state.shapes.length, 1);

  // move
  state.undoStack.push({ type: 'move', shape: rect, dx: 5, dy: 7 });
  btnUndo.fire('click');
  assert.deepEqual([rect.x1, rect.y1], [-5, -7]);
  btnRedo.fire('click');
  assert.deepEqual([rect.x1, rect.y1], [0, 0]);

  // style — the entry swaps values, so it drives both directions
  rect.color = '#00f';
  state.undoStack.push({ type: 'style', shape: rect, prev: { color: '#f00' } });
  btnUndo.fire('click');
  assert.equal(rect.color, '#f00');
  btnRedo.fire('click');
  assert.equal(rect.color, '#00f');

  // reshape
  state.undoStack.push({ type: 'reshape', shape: rect, prev: { x2: 99 } });
  btnUndo.fire('click');
  assert.equal(rect.x2, 99);
  btnRedo.fire('click');
  assert.equal(rect.x2, 10);

  // replace — committing a re-edited text shape swaps the old shape for a
  // new one *in place* (see editor-text.mjs commitActiveText), preserving
  // z-order. Sandwich it between two sentinel shapes so an implementation
  // that removes-and-re-appends instead of splicing in place (silently
  // reordering annotations) would fail this, not just a last-element check.
  const before = { type: 'rect', color: '#111', x1: 0, y1: 0, x2: 1, y2: 1 };
  const after = { type: 'rect', color: '#222', x1: 0, y1: 0, x2: 1, y2: 1 };
  const oldText = { type: 'text', color: '#fff', fontSize: 24, text: 'old text', x1: 5, y1: 5, width: 50 };
  const newText = { type: 'text', color: '#fff', fontSize: 24, text: 'new text', x1: 15, y1: 25, width: 90 };
  state.shapes = [before, newText, after];
  state.selectedShape = newText;
  state.undoStack.push({ type: 'replace', oldShape: oldText, newShape: newText });
  btnUndo.fire('click');
  assert.deepEqual(state.shapes, [before, oldText, after], 'undo replaces in place, between the same sentinels');
  assert.equal(state.selectedShape, null, 'the replaced-away shape is deselected');
  btnRedo.fire('click');
  assert.deepEqual(state.shapes, [before, newText, after], 'redo replaces in place, between the same sentinels');
  state.shapes = [rect];

  // delete
  state.shapes.splice(0, 1);
  state.undoStack.push({ type: 'delete', shape: rect, index: 0 });
  btnUndo.fire('click');
  assert.equal(state.shapes.length, 1);
  btnRedo.fire('click');
  assert.equal(state.shapes.length, 0);

  // clear
  state.shapes = [rect];
  state.undoStack.push({ type: 'clear', shapes: [rect] });
  state.shapes = [];
  btnUndo.fire('click');
  assert.equal(state.shapes.length, 1);
  btnRedo.fire('click');
  assert.equal(state.shapes.length, 0);
});

test('Clear stacks one undo entry and Redo empties the canvas again', () => {
  const { state, renderer } = freshEditor();
  const noop = () => {};
  createHistory({
    state,
    drawEverything: renderer.drawEverything,
    showToast: noop,
    setSelection: (s) => { state.selectedShape = s || null; },
    updatePropertyPanelsVisibility: noop,
    syncPropertyPanelToSelection: noop,
    commitActiveText: noop,
    cancelActiveText: noop
  });
  state.shapes = [{ type: 'rect', x1: 0, y1: 0, x2: 5, y2: 5 }];
  document.getElementById('btn-clear').fire('click');
  assert.equal(state.shapes.length, 0);
  assert.equal(state.undoStack.length, 1);
  document.getElementById('btn-undo').fire('click');
  assert.equal(state.shapes.length, 1);
});

test('the text editor opens a textarea and commits it to a shape', () => {
  const { state, canvas, renderer } = freshEditor();
  const noop = () => {};
  const text = createTextEditor({
    canvas,
    canvasWrapper: makeElement(),
    state,
    fontWeightForFamily: renderer.fontWeightForFamily,
    drawEverything: renderer.drawEverything,
    clearRedoStack: noop,
    updateUndoButton: noop,
    updatePropertyPanelsVisibility: noop,
    syncColorControls: noop,
    syncFontControls: noop,
    syncPropertyPanelToSelection: noop
  });

  text.createTextarea(10, 10, 20, 20);
  assert.ok(state.activeTextarea, 'a textarea is open');
  state.activeTextarea.element.value = 'hello';
  text.commitActiveText();

  assert.equal(state.activeTextarea, null, 'and closed again');
  assert.equal(state.shapes.length, 1);
  assert.equal(state.shapes[0].type, 'text');
  assert.equal(state.shapes[0].text, 'hello');
  assert.equal(state.undoStack.length, 1);
});

test('cancelling a re-edit puts the original shape back', () => {
  const { state, canvas, renderer } = freshEditor();
  const noop = () => {};
  const text = createTextEditor({
    canvas,
    canvasWrapper: makeElement(),
    state,
    fontWeightForFamily: renderer.fontWeightForFamily,
    drawEverything: renderer.drawEverything,
    clearRedoStack: noop,
    updateUndoButton: noop,
    updatePropertyPanelsVisibility: noop,
    syncColorControls: noop,
    syncFontControls: noop,
    syncPropertyPanelToSelection: noop
  });

  const original = {
    type: 'text', color: '#fff', fontSize: 24, text: 'first',
    x1: 5, y1: 5, width: 100
  };
  // Re-edit removes the shape from the list first, as the dblclick path does.
  text.createTextarea(5, 5, 5, 5, original, 0);
  text.cancelActiveText();
  assert.deepEqual(state.shapes, [original]);
});

test('the export buttons run without a live canvas', () => {
  const { state, canvas, renderer } = freshEditor();
  state.sourceUrl = 'https://example.com/page';
  createExport({
    canvas,
    state,
    drawEverything: renderer.drawEverything,
    showToast: () => {},
    commitActiveText: () => {}
  });
  // Each handler must at least run; the stub canvas yields no blob/bitmap.
  assert.equal(document.getElementById('btn-copy').fire('click'), 1);
  assert.equal(document.getElementById('btn-save').fire('click'), 1);
  assert.equal(document.getElementById('btn-save-path').fire('click'), 1);
});

test('the AI Lens panel wires up and its controls run', async () => {
  const { state, canvas } = freshEditor();
  createAiLens({
    canvas,
    state,
    showToast: () => {},
    commitActiveText: () => {}
  });
  await new Promise(r => setImmediate(r)); // let initAiLens settle

  const select = document.getElementById('ai-provider-select');
  select.value = 'vertex';
  assert.equal(select.fire('change'), 1);
  select.value = 'aistudio';
  select.fire('change');

  assert.equal(document.getElementById('btn-unlock-ai').fire('click'), 1);
  assert.equal(document.getElementById('btn-close-setup').fire('click'), 1);
  // No key stored, so Save should bail with a toast rather than throw.
  assert.equal(document.getElementById('btn-save-key').fire('click'), 1);
  assert.equal(document.getElementById('btn-reset-key').fire('click'), 1);
  assert.equal(document.getElementById('btn-ai-copy').fire('click'), 1);
  assert.equal(document.getElementById('ai-prompt-input').fire('keydown', { key: 'a' }), 1);
});

test('the property panel wires up and its controls restyle the selection', () => {
  const { state, canvas, renderer } = freshEditor();
  const noop = () => {};
  const panel = createPropertyPanel({
    canvas,
    state,
    drawEverything: renderer.drawEverything,
    fontWeightForFamily: renderer.fontWeightForFamily,
    showToast: noop,
    clearRedoStack: noop,
    updateUndoButton: noop,
    commitActiveText: noop
  });

  // A tool button switches tool and drops any selection.
  state.selectedShape = { type: 'rect' };
  __groups('.tool-btn')[0].fire('click');
  assert.equal(state.activeTool, 'pen');
  assert.equal(state.selectedShape, null);

  // Nothing selected: the controls describe the next shape to be drawn.
  panel.updatePropertyPanelsVisibility();
  panel.syncPropertyPanelToSelection();
  panel.syncColorControls('#123456');
  panel.syncFontControls(32, "'Inter', -apple-system, sans-serif", true);

  // With a shape selected they describe (and edit) that shape.
  const rect = { type: 'rect', color: '#ff3b30', lineWidth: 3, x1: 0, y1: 0, x2: 10, y2: 10 };
  state.shapes.push(rect);
  state.activeTool = 'select';
  panel.setSelection(rect);
  assert.equal(state.selectedShape, rect);

  // Clicking the real controls must restyle the selected shape.
  __groups('.color-swatch')[0].fire('click');
  assert.equal(rect.color, '#00ff00', 'a colour swatch recolours the selection');

  __groups('.stroke-btn')[1].fire('click');
  assert.equal(rect.lineWidth, 6, 'a stroke button rewidths the selection');

  document.getElementById('fill-checkbox').fire('change', { target: { checked: true } });
  assert.equal(rect.isFilled, true, 'the fill toggle fills the selection');

  __groups('.fill-swatch')[1].fire('click');
  assert.equal(rect.fillColor, '#ff00ff', 'a fill swatch recolours the fill');

  // ...and the panel must not push properties a shape type ignores.
  const blur = { type: 'blur', x1: 0, y1: 0, x2: 5, y2: 5 };
  state.shapes.push(blur);
  panel.setSelection(blur);
  __groups('.color-swatch')[1].fire('click');
  assert.equal(blur.color, undefined, 'a blur region has no colour to set');

  // A highlighter stores 3x the panel width; restyling keeps that relationship.
  const hl = { type: 'highlighter', color: '#ff0', lineWidth: 18, points: [{ x: 0, y: 0 }] };
  state.shapes.push(hl);
  panel.setSelection(hl);
  __groups('.stroke-btn')[1].fire('click');
  assert.equal(hl.lineWidth, 18, '6 on the panel is 18 on a highlighter');

  panel.setSelection(rect);

  // Every shape type must survive being selected.
  for (const shape of [
    rect,
    { type: 'blur', x1: 0, y1: 0, x2: 5, y2: 5 },
    { type: 'text', color: '#fff', fontSize: 24, text: 'hi', x1: 0, y1: 0 },
    { type: 'highlighter', color: '#ff0', lineWidth: 18, points: [{ x: 0, y: 0 }] }
  ]) {
    state.shapes.push(shape);
    panel.setSelection(shape);
  }

  panel.setSelection(null);
  assert.equal(state.selectedShape, null);

  // Each tool in turn, since visibility branches per tool.
  for (const tool of ['select', 'pen', 'arrow', 'rect', 'ellipse', 'highlighter', 'blur', 'text', 'ai-lens']) {
    state.activeTool = tool;
    panel.updatePropertyPanelsVisibility();
    panel.syncPropertyPanelToSelection();
  }
});

test('a font-family change previews on an active text edit and commits to the shape', () => {
  const { state, canvas, renderer } = freshEditor();
  const noop = () => {};
  createPropertyPanel({
    canvas,
    state,
    drawEverything: renderer.drawEverything,
    fontWeightForFamily: renderer.fontWeightForFamily,
    showToast: noop,
    clearRedoStack: noop,
    updateUndoButton: noop,
    commitActiveText: noop
  });
  const text = createTextEditor({
    canvas,
    canvasWrapper: makeElement(),
    state,
    fontWeightForFamily: renderer.fontWeightForFamily,
    drawEverything: renderer.drawEverything,
    clearRedoStack: noop,
    updateUndoButton: noop,
    updatePropertyPanelsVisibility: noop,
    syncColorControls: noop,
    syncFontControls: noop,
    syncPropertyPanelToSelection: noop
  });

  text.createTextarea(10, 10, 20, 20);
  assert.ok(state.activeTextarea, 'a textarea is open');

  // editor-panel.mjs wires the font selector to preview live on whatever
  // textarea is open, and editor-text.mjs reads the pending family back off
  // state.activeTextarea when it builds the committed shape.
  const fontSelect = document.getElementById('font-family-select');
  fontSelect.value = "'Inter', -apple-system, sans-serif";
  fontSelect.fire('change');
  assert.equal(state.activeTextarea.element.style.fontFamily, "'Inter', -apple-system, sans-serif", 'the textarea previews the new family live');
  assert.equal(state.activeTextarea.element.style.fontWeight, 'bold', "and its weight (Inter is a bold-listed family)");
  assert.equal(state.activeTextarea.fontFamily, "'Inter', -apple-system, sans-serif", 'the pending family is tracked for commit');

  state.activeTextarea.element.value = 'styled text';
  text.commitActiveText();
  assert.equal(state.shapes[state.shapes.length - 1].fontFamily, "'Inter', -apple-system, sans-serif", 'the committed shape stores the chosen family');
});

test('the toast shows a message and the hint fires only once', () => {
  const toastEl = makeElement();
  const messageEl = makeElement();
  toastEl.querySelector = () => messageEl;
  const showToast = createToast(toastEl);
  showToast('hello');
  assert.equal(messageEl.textContent, 'hello');
  assert.ok(toastEl.classList.contains('show'));

  let shown = 0;
  const hint = createTextEditHint(() => { shown++; }, {
    _d: new Map(),
    getItem(k) { return this._d.get(k) ?? null; },
    setItem(k, v) { this._d.set(k, v); }
  });
  hint();
  hint();
  hint();
  assert.equal(shown, 1);
});

test('the sidebar resize wires up and clamps its width', () => {
  const sidebar = document.querySelector('.right-properties');
  // getBoundingClientRect tracks the stub's own style.width, so the drag
  // math (which reads back the current width mid-drag and on release) sees
  // the same value the handler just wrote.
  sidebar.getBoundingClientRect = () => ({
    left: 0, top: 0, height: 300,
    width: parseInt(sidebar.style.width, 10) || 400
  });

  const persisted = {};
  const storage = {
    get(keys, cb) { cb({}); },
    set(obj) { Object.assign(persisted, obj); }
  };
  initSidebarResize(storage);
  const handle = document.getElementById('sidebar-resize-handle');

  assert.equal(handle.fire('mousedown', { clientX: 100 }), 1);

  // The sidebar hangs off the right edge, so dragging left (negative deltaX)
  // widens it. Drag far enough to blow past MAX_WIDTH and check the clamp.
  window.fire('mousemove', { clientX: 100 - 1000 });
  assert.equal(sidebar.style.width, '600px', 'widening clamps at 600px');

  // Reverse past MIN_WIDTH and check the other clamp.
  window.fire('mousemove', { clientX: 100 + 1000 });
  assert.equal(sidebar.style.width, '240px', 'narrowing clamps at 240px');

  window.fire('mouseup');
  assert.equal(persisted.sidebarWidth, 240, 'the final clamped width is persisted');
});

test('the sidebar resize is a no-op when the sidebar element is missing', () => {
  const originalQuerySelector = document.querySelector;
  document.querySelector = (selector) => (selector === '.right-properties' ? null : originalQuerySelector(selector));
  let storageGetCalls = 0;
  const storage = {
    get(keys, cb) { storageGetCalls++; cb({}); },
    set() {}
  };
  try {
    assert.doesNotThrow(() => initSidebarResize(storage));
    // Without a sidebar there's nowhere to apply a restored width, so the
    // module must bail before ever touching storage.
    assert.equal(storageGetCalls, 0, 'storage.get is never called');
  } finally {
    document.querySelector = originalQuerySelector;
  }
});

test('the sidebar still restores its saved width when the resize handle is missing', () => {
  const sidebar = document.querySelector('.right-properties');
  sidebar.style.width = ''; // reset from whatever an earlier test left behind
  const originalGetElementById = document.getElementById;
  document.getElementById = (id) => (id === 'sidebar-resize-handle' ? null : originalGetElementById(id));
  const storage = {
    get(keys, cb) { cb({ sidebarWidth: 300 }); },
    set() {}
  };
  try {
    assert.doesNotThrow(() => initSidebarResize(storage));
    assert.equal(sidebar.style.width, '300px', 'the saved width still applies without a resize handle to drag');
  } finally {
    document.getElementById = originalGetElementById;
  }
});
