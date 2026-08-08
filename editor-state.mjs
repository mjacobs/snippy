// The editor's mutable state, in one place, plus the constants that describe
// its value ranges. Everything the annotation modules read or write lives on
// the object createEditorState() returns; the bootstrap creates exactly one
// and hands it to each module.

export const DEFAULT_FONT_FAMILY = "'Inter', -apple-system, sans-serif";
export const FONT_SIZE_MIN = 8;
export const FONT_SIZE_MAX = 200;
export const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

// My Colors: up to six remembered colors, persisted as an array of hex
// strings under a single chrome.storage.local key so a user's own palette
// (e.g. brand colors) survives sessions.
export const MY_COLORS_KEY = 'snippyMyColors';
export const MY_COLORS_MAX = 6;

// Expand shorthand #rgb to #rrggbb for the native <input type="color">,
// which only accepts the 6-digit form.
export function normalizeHex(hex) {
  if (/^#([0-9a-fA-F]{3})$/.test(hex)) {
    return '#' + hex.slice(1).split('').map(c => c + c).join('');
  }
  return hex;
}

// Sealed on purpose: modules share this object by reference, so a typo'd
// property name would otherwise create a silent new field that nothing reads.
// Sealing turns that into a TypeError at the assignment (module code is
// strict), which is the difference between a caught bug and a mystery.
export function createEditorState() {
  return Object.seal({
    // --- The document being edited ---
    bgImage: null,
    shapes: [],
    // URL of the page the screenshot was captured from; embedded as image
    // metadata (XMP / PNG iTXt) on export.
    sourceUrl: '',

    // --- History ---
    // Each undo entry describes one mutation so Undo can revert adds,
    // deletes, moves, restyles, reshapes, text re-edits and full clears
    // uniformly. Entries:
    //   {type:'add',shape} {type:'delete',shape,index}
    //   {type:'move',shape,dx,dy} {type:'replace',oldShape,newShape}
    //   {type:'style',shape,prev:{prop:oldValue,...}}
    //   {type:'reshape',shape,prev:{x1,y1,x2,y2}|{width}}
    //   {type:'clear',shapes:[...]}
    undoStack: [],
    // Entries popped off undoStack by Undo, re-applied forward by Redo. Any
    // new mutation invalidates it.
    redoStack: [],

    // --- Settings applied to the NEXT shape drawn ---
    activeTool: 'select', // select, pen, arrow, rect, highlighter, blur, text
    activeColor: '#ff3b30', // Red default
    activeLineWidth: 3, // Thin
    activeHighlighterLineWidth: 18, // Legacy default; panel Medium (6) × 3
    activeFontSize: 24, // Medium
    activeFontFamily: DEFAULT_FONT_FAMILY,
    activeTextShadow: false, // Drop shadow default-off for new text shapes
    activeFill: false,
    activeFillColor: null, // null = match stroke color

    // --- Drawing gesture in progress ---
    isDrawing: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    currentShape: null,

    // --- In-place text editing ---
    activeTextarea: null,
    doubleClickCandidate: null,

    // --- Select tool ---
    selectedShape: null,   // The currently selected shape, or null
    isDraggingShape: false,
    dragLastX: 0,          // Last pointer position (backing coords) during a drag
    dragLastY: 0,
    dragTotalDX: 0,        // Accumulated drag delta, recorded for Undo on mouseup
    dragTotalDY: 0,
    resizingHandleId: null, // Handle being dragged to reshape, or null
    resizePrevProps: null,  // Pre-drag shape properties, recorded for Undo
    resizeAnchor: null,     // Pinned opposite corner for box resizes

    // Continuous controls (number input, native color picker) coalesce their
    // per-event style entries into one undo step — but only within a single
    // gesture. Each control ends its gesture (on change/blur) by bumping this
    // token, so a NEW drag or typing burst never folds into an old entry and
    // Undo can't revert two unrelated edits at once.
    styleGestureId: 0,

    // --- My Colors ---
    myColors: [],
    myColorsLoaded: false // Gate mutations until the stored set arrives
  });
}
