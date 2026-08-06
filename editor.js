// Snippy Image Editor

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const canvas = document.getElementById('editor-canvas');
  const canvasWrapper = document.getElementById('canvas-wrapper');
  const imgDimensions = document.getElementById('image-dimensions');
  
  // Action buttons
  const btnUndo = document.getElementById('btn-undo');
  const btnRedo = document.getElementById('btn-redo');
  const btnClear = document.getElementById('btn-clear');
  const btnCopy = document.getElementById('btn-copy');
  const btnSave = document.getElementById('btn-save');
  const btnSavePath = document.getElementById('btn-save-path');
  
  // Tool buttons
  const toolButtons = document.querySelectorAll('.tool-btn');
  const toolAiLens = document.getElementById('tool-ai-lens');
  
  // Property panels
  const propColor = document.getElementById('prop-color');
  const propStroke = document.getElementById('prop-stroke');
  const propFill = document.getElementById('prop-fill');
  const propFont = document.getElementById('prop-font');
  
  // AI Lens elements
  const propAiLens = document.getElementById('prop-ai-lens');
  const aiLockedState = document.getElementById('ai-locked-state');
  const btnUnlockAi = document.getElementById('btn-unlock-ai');
  const btnCloseSetup = document.getElementById('btn-close-setup');
  const aiSetupContainer = document.getElementById('ai-setup-container');
  const aiActiveContainer = document.getElementById('ai-active-container');
  const aiKeyInput = document.getElementById('ai-key-input');
  const btnSaveKey = document.getElementById('btn-save-key');
  const btnResetKey = document.getElementById('btn-reset-key');
  const aiPromptInput = document.getElementById('ai-prompt-input');
  const btnAiSend = document.getElementById('btn-ai-send');
  const aiOutputCard = document.getElementById('ai-output-card');
  const aiOutputText = document.getElementById('ai-output-text');
  const btnAiCopy = document.getElementById('btn-ai-copy');
  const aiActionButtons = document.querySelectorAll('.ai-action-btn');
  
  // AI Provider & Vertex AI elements
  const aiProviderSelect = document.getElementById('ai-provider-select');
  const containerApiKey = document.getElementById('container-api-key');
  const containerProjectId = document.getElementById('container-project-id');
  const containerRegion = document.getElementById('container-region');
  const aiProjectInput = document.getElementById('ai-project-input');
  const aiRegionInput = document.getElementById('ai-region-input');
  const aiKeyLink = document.getElementById('ai-key-link');
  const aiModelInput = document.getElementById('ai-model-input');
  
  // Property controls
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

  // Toast
  const toast = document.getElementById('toast');
  const toastMessage = toast.querySelector('.toast-message');

  // Canvas context
  const ctx = canvas.getContext('2d');
  
  // Editor State
  let bgImage = null;
  let shapes = [];
  // Undo history: each entry describes one mutation so Undo can revert
  // adds, deletes, moves, text re-edits, and full clears uniformly.
  // Entries: {type:'add',shape} {type:'delete',shape,index}
  //          {type:'move',shape,dx,dy} {type:'replace',oldShape,newShape}
  //          {type:'style',shape,prev:{prop:oldValue,...}}
  //          {type:'reshape',shape,prev:{x1,y1,x2,y2}}
  //          {type:'clear',shapes:[...]}
  let undoStack = [];
  // Redo history: entries popped off undoStack by Undo, re-applied forward
  // by Redo. Any new mutation invalidates it (see clearRedoStack below).
  let redoStack = [];

  // Any new action invalidates the redo trail, since it no longer leads
  // back to a state Redo can reconstruct.
  function clearRedoStack() {
    redoStack = [];
    updateRedoButton();
  }
  
  let activeTool = 'select'; // select, pen, arrow, rect, highlighter, blur, text
  let activeColor = '#ff3b30'; // Red default
  let activeLineWidth = 3; // Thin
  let activeFontSize = 24; // Medium
  const DEFAULT_FONT_FAMILY = "'Inter', -apple-system, sans-serif";
  let activeFontFamily = DEFAULT_FONT_FAMILY;
  let activeTextShadow = false; // Drop shadow default-off for new text shapes
  let activeFill = false;
  let activeFillColor = null; // null = match stroke color
  
  let isDrawing = false;
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let currentY = 0;
  let currentShape = null;
  let activeTextarea = null;

  // Select tool state
  let selectedShape = null;   // Reference to the currently selected shape (or null)
  let isDraggingShape = false;
  let dragLastX = 0;          // Last pointer position (backing coords) during a drag
  let dragLastY = 0;
  let dragTotalDX = 0;        // Accumulated drag delta, recorded for Undo on mouseup
  let dragTotalDY = 0;
  let resizingHandleId = null; // Handle being dragged to reshape, or null
  let resizePrevCoords = null; // Pre-drag x1/y1/x2/y2, recorded for Undo
  let resizeAnchor = null;     // Pinned opposite corner for box resizes

  // URL of the page the screenshot was captured from; embedded as image
  // metadata (XMP / PNG iTXt) on export.
  let sourceUrl = '';

  // Provenance metadata must not leak secrets when a screenshot is shared:
  // keep only http(s) URLs, drop credentials, fragments, and the entire query
  // string — param names can't be trusted to reveal which values are secret.
  // The path is kept deliberately: origin-only provenance is too coarse to be
  // useful, and the path rarely carries secrets compared to the query.
  function sanitizeSourceUrl(raw) {
    try {
      const u = new URL(raw);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
      u.username = '';
      u.password = '';
      u.hash = '';
      u.search = '';
      return u.toString();
    } catch (err) {
      return '';
    }
  }

  // 1. Load active screenshot from storage
  try {
    const data = await chrome.storage.local.get(['activeScreenshot', 'sourceUrl']);
    if (data && data.sourceUrl) {
      sourceUrl = sanitizeSourceUrl(data.sourceUrl);
    }
    if (data && data.activeScreenshot) {
      bgImage = new Image();
      bgImage.onload = () => {
        setupCanvas();
      };
      bgImage.src = data.activeScreenshot;
    } else {
      showToast('No screenshot found. Draw a crop box on a webpage first!');
    }
  } catch (err) {
    console.error('Failed to load active screenshot:', err);
    showToast('Error loading screenshot.');
  }

  // Set up Canvas dimensions
  function setupCanvas() {
    if (!bgImage) return;
    
    // Set backing resolution to match the image exactly
    canvas.width = bgImage.naturalWidth;
    canvas.height = bgImage.naturalHeight;
    
    // Update header info tag
    imgDimensions.textContent = `${bgImage.naturalWidth} × ${bgImage.naturalHeight} px`;

    // Render initial view
    drawEverything();

    // Canvas text is rasterized at draw time and won't reflow when a web font
    // arrives later, so re-render once fonts are ready to guarantee text
    // annotations use Inter instead of a fallback.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => drawEverything());
    }
  }

  // Draw background image and all shapes
  function drawEverything() {
    if (!ctx || !bgImage) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw background screenshot
    ctx.drawImage(bgImage, 0, 0);

    // Draw all shapes in history
    for (const shape of shapes) {
      drawShape(shape);
    }

    // Draw the selection outline on top (Select tool only)
    if (activeTool === 'select' && selectedShape && shapes.includes(selectedShape)) {
      drawSelectionOutline(selectedShape);
    }
  }

  // Dashed selection rectangle around the selected shape's bounding box,
  // plus any reshape handles the shape type supports. This is selection
  // chrome only: exports run through withSelectionSuppressed, which clears
  // selectedShape and redraws, so none of it reaches the saved image.
  function drawSelectionOutline(shape) {
    const b = getShapeBBox(shape);
    const pad = 4;
    ctx.save();
    ctx.strokeStyle = '#007aff';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(b.x1 - pad, b.y1 - pad, (b.x2 - b.x1) + pad * 2, (b.y2 - b.y1) + pad * 2);
    ctx.restore();

    const r = handleRadius();
    ctx.save();
    ctx.setLineDash([]);
    ctx.lineWidth = Math.max(1, r * 0.35);
    ctx.strokeStyle = '#007aff';
    ctx.fillStyle = '#ffffff';
    for (const h of getHandles(shape)) {
      ctx.beginPath();
      ctx.arc(h.x, h.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // Inter/Outfit are bold display faces; everything else (system sans,
  // serif/mono/cursive) reads better at normal weight, so pick the weight
  // to match the family.
  function fontWeightForFamily(family) {
    return /Inter|Outfit/.test(family) ? 'bold' : 'normal';
  }

  // Build a canvas/CSS font shorthand for a family + size pair.
  function fontString(fontSize, family) {
    return `${fontWeightForFamily(family)} ${fontSize}px ${family}`;
  }

  // Greedily wrap a single paragraph into lines that fit maxWidth (backing px)
  // using the currently-set ctx.font. Words that individually exceed maxWidth
  // are allowed to overflow rather than being split mid-word.
  function wrapTextToWidth(text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let current = '';

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (!current || ctx.measureText(candidate).width <= maxWidth) {
        current = candidate;
      } else {
        lines.push(current);
        current = word;
      }
    }
    lines.push(current);
    return lines;
  }

  // Helper to draw a single shape
  function drawShape(shape) {
    ctx.save();
    
    if (shape.type === 'pen') {
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = shape.lineWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(shape.points[0].x, shape.points[0].y);
      for (let i = 1; i < shape.points.length; i++) {
        ctx.lineTo(shape.points[i].x, shape.points[i].y);
      }
      ctx.stroke();
    } 
    else if (shape.type === 'highlighter') {
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = shape.lineWidth || 18; // Fall back for old shapes
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalAlpha = 0.45; // Transparent overlay
      ctx.beginPath();
      ctx.moveTo(shape.points[0].x, shape.points[0].y);
      for (let i = 1; i < shape.points.length; i++) {
        ctx.lineTo(shape.points[i].x, shape.points[i].y);
      }
      ctx.stroke();
    } 
    else if (shape.type === 'rect') {
      ctx.strokeStyle = shape.color;
      ctx.fillStyle = shape.fillColor || shape.color; // Back-compat: old shapes have no fillColor
      ctx.lineWidth = shape.lineWidth;
      ctx.lineJoin = 'round';

      const rx = Math.min(shape.x1, shape.x2);
      const ry = Math.min(shape.y1, shape.y2);
      const rw = Math.abs(shape.x2 - shape.x1);
      const rh = Math.abs(shape.y2 - shape.y1);

      if (shape.isFilled) {
        ctx.globalAlpha = 0.4; // Semi-transparent fills look ultra-premium
        ctx.fillRect(rx, ry, rw, rh);
        ctx.globalAlpha = 1.0;
        ctx.strokeRect(rx, ry, rw, rh);
      } else {
        ctx.strokeRect(rx, ry, rw, rh);
      }
    }
    else if (shape.type === 'ellipse') {
      ctx.strokeStyle = shape.color;
      ctx.fillStyle = shape.fillColor || shape.color; // Back-compat: old shapes have no fillColor
      ctx.lineWidth = shape.lineWidth;
      ctx.lineJoin = 'round';

      const ex = Math.min(shape.x1, shape.x2);
      const ey = Math.min(shape.y1, shape.y2);
      const ew = Math.abs(shape.x2 - shape.x1);
      const eh = Math.abs(shape.y2 - shape.y1);
      const cx = ex + ew / 2;
      const cy = ey + eh / 2;
      const radiusX = ew / 2;
      const radiusY = eh / 2;

      ctx.beginPath();
      ctx.ellipse(cx, cy, radiusX, radiusY, 0, 0, Math.PI * 2);

      if (shape.isFilled) {
        ctx.globalAlpha = 0.4; // Semi-transparent fills look ultra-premium
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.stroke();
      } else {
        ctx.stroke();
      }
    }
    else if (shape.type === 'arrow') {
      drawArrow(shape.x1, shape.y1, shape.x2, shape.y2, shape.color, shape.lineWidth);
    } 
    else if (shape.type === 'blur') {
      const bx = Math.min(shape.x1, shape.x2);
      const by = Math.min(shape.y1, shape.y2);
      const bw = Math.abs(shape.x2 - shape.x1);
      const bh = Math.abs(shape.y2 - shape.y1);
      
      if (bw > 2 && bh > 2) {
        // Draw pixelated background region
        const pixelSize = 10;
        const sw = Math.ceil(bw / pixelSize);
        const sh = Math.ceil(bh / pixelSize);
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = sw;
        tempCanvas.height = sh;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Draw slice of original screenshot
        tempCtx.drawImage(bgImage, bx, by, bw, bh, 0, 0, sw, sh);
        
        // Scale it up blocky
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tempCanvas, 0, 0, sw, sh, bx, by, bw, bh);
        ctx.imageSmoothingEnabled = true;
        
        // Nice subtle border around blurred area
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, bw, bh);
      }
    } 
    else if (shape.type === 'text') {
      const family = shape.fontFamily || DEFAULT_FONT_FAMILY;
      ctx.fillStyle = shape.color;
      ctx.font = fontString(shape.fontSize, family);
      ctx.textBaseline = 'top';

      // Split on manual newlines first, then word-wrap each paragraph to the
      // box width if one was recorded (older shapes without width don't wrap).
      const paragraphs = shape.text.split('\n');
      const lines = [];
      for (const para of paragraphs) {
        if (shape.width) {
          for (const wrapped of wrapTextToWidth(para, shape.width)) {
            lines.push(wrapped);
          }
        } else {
          lines.push(para);
        }
      }

      let textY = shape.y1;

      for (const line of lines) {
        // Drop shadow for readability (opt-in per shape, default off)
        if (shape.shadow) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.fillText(line, shape.x1 + 1.5, textY + 1.5);
        }

        ctx.fillStyle = shape.color;
        ctx.fillText(line, shape.x1, textY);
        textY += shape.fontSize * 1.25;
      }
    }
    
    ctx.restore();
  }

  // Draw a crisp arrow with calculated directional headers
  function drawArrow(x1, y1, x2, y2, color, width) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw main arrow line
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Directional trigonometry for arrow-head sides
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const headLength = Math.max(12, width * 3.5); // Proportional arrowhead size

    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - headLength * Math.cos(angle - Math.PI / 6), 
      y2 - headLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      x2 - headLength * Math.cos(angle + Math.PI / 6), 
      y2 - headLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  }

  // Convert client viewport mouse position to canvas resolution backing-store coords
  function getBackingCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) * (canvas.width / rect.width);
    const y = (clientY - rect.top) * (canvas.height / rect.height);
    return { x, y };
  }

  // Convert canvas resolution backing-store coords back to client display scale coords
  function getClientCoords(backingX, backingY) {
    const rect = canvas.getBoundingClientRect();
    const x = rect.left + backingX * (rect.width / canvas.width);
    const y = rect.top + backingY * (rect.height / canvas.height);
    return { x, y };
  }

  // ==========================================
  // Select Tool: Hit-testing, Bounding Boxes & Movement
  // ==========================================

  // Shortest distance from point (px,py) to segment (ax,ay)-(bx,by), backing coords
  function distToSegment(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    if (dx === 0 && dy === 0) {
      return Math.hypot(px - ax, py - ay);
    }
    let t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  // Normalized bounding box {x1,y1,x2,y2} for any shape (backing coords)
  function getShapeBBox(shape) {
    if (shape.type === 'text') {
      // Measure per-line extents at the shape's own font, mirroring drawShape:
      // manual newlines first, then word-wrap to the stored box width if any.
      ctx.save();
      ctx.font = fontString(shape.fontSize, shape.fontFamily || DEFAULT_FONT_FAMILY);
      const lines = [];
      for (const para of String(shape.text).split('\n')) {
        if (shape.width) {
          lines.push(...wrapTextToWidth(para, shape.width));
        } else {
          lines.push(para);
        }
      }
      let maxWidth = 0;
      for (const line of lines) {
        const w = ctx.measureText(line).width;
        if (w > maxWidth) maxWidth = w;
      }
      ctx.restore();
      const height = shape.fontSize * 1.25 * lines.length; // textBaseline top
      return { x1: shape.x1, y1: shape.y1, x2: shape.x1 + maxWidth, y2: shape.y1 + height };
    }
    if (shape.points && shape.points.length) {
      // pen / highlighter: bbox spanning all points
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of shape.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      return { x1: minX, y1: minY, x2: maxX, y2: maxY };
    }
    // rect / ellipse / blur / arrow / any unknown bbox type: fall back to x1..x2,y1..y2
    return {
      x1: Math.min(shape.x1, shape.x2),
      y1: Math.min(shape.y1, shape.y2),
      x2: Math.max(shape.x1, shape.x2),
      y2: Math.max(shape.y1, shape.y2)
    };
  }

  // True if the point (backing coords) hits the shape
  function hitTestShape(shape, x, y) {
    const tol = 6;
    if (shape.type === 'arrow') {
      const w = shape.lineWidth || 3;
      return distToSegment(x, y, shape.x1, shape.y1, shape.x2, shape.y2) <= w / 2 + tol;
    }
    if (shape.type === 'pen' || shape.type === 'highlighter') {
      const w = shape.lineWidth || (shape.type === 'highlighter' ? 18 : 3);
      const pts = shape.points || [];
      for (let i = 1; i < pts.length; i++) {
        if (distToSegment(x, y, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) <= w / 2 + tol) {
          return true;
        }
      }
      return false;
    }
    // bbox-based hit test (rect, ellipse, blur, text, unknown types)
    const b = getShapeBBox(shape);
    if (x < b.x1 - tol || x > b.x2 + tol || y < b.y1 - tol || y > b.y2 + tol) {
      return false;
    }
    // Hollow rect/ellipse: only the outline ring is selectable, so clicks in
    // the empty interior can reach shapes stacked underneath.
    if ((shape.type === 'rect' || shape.type === 'ellipse') && !shape.isFilled) {
      const ring = (shape.lineWidth || 3) / 2 + tol;
      if (shape.type === 'ellipse') {
        const cx = (b.x1 + b.x2) / 2;
        const cy = (b.y1 + b.y2) / 2;
        const rx = (b.x2 - b.x1) / 2;
        const ry = (b.y2 - b.y1) / 2;
        const norm = (rxx, ryy) => {
          const nx = (x - cx) / rxx;
          const ny = (y - cy) / ryy;
          return nx * nx + ny * ny;
        };
        if (rx + ring <= 0 || ry + ring <= 0 || norm(rx + ring, ry + ring) > 1) return false;
        if (rx > ring && ry > ring && norm(rx - ring, ry - ring) < 1) return false;
        return true;
      }
      const insideInner = x >= b.x1 + ring && x <= b.x2 - ring &&
                          y >= b.y1 + ring && y <= b.y2 - ring;
      if (insideInner) return false;
    }
    return true;
  }

  // Topmost shape at a point (iterate from end), or null
  function getShapeAt(x, y) {
    for (let i = shapes.length - 1; i >= 0; i--) {
      if (hitTestShape(shapes[i], x, y)) return shapes[i];
    }
    return null;
  }

  // Translate whichever coordinate fields the shape carries by (dx, dy)
  function translateShape(shape, dx, dy) {
    if (typeof shape.x1 === 'number') { shape.x1 += dx; shape.y1 += dy; }
    if (typeof shape.x2 === 'number') { shape.x2 += dx; shape.y2 += dy; }
    if (shape.points) {
      for (const p of shape.points) { p.x += dx; p.y += dy; }
    }
  }

  // ==========================================
  // Select Tool: Reshape Handles
  // ==========================================

  // Handles are drawn in backing coords but should stay a constant size on
  // screen, so scale the radius by however much the canvas is displayed down
  // (or up) from its backing resolution.
  function handleRadius() {
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width > 0 ? canvas.width / rect.width : 1;
    return Math.max(4, 6 * scale);
  }

  // Reshape handles for a shape, in draw order: endpoints for arrows/lines,
  // corners for the box-shaped types. Pen/highlighter strokes and text are
  // move-only and return none.
  function getHandles(shape) {
    if (shape.type === 'arrow' || shape.type === 'line') {
      return [
        { id: 'p1', x: shape.x1, y: shape.y1, cursor: 'grab' },
        { id: 'p2', x: shape.x2, y: shape.y2, cursor: 'grab' }
      ];
    }
    if (shape.type === 'rect' || shape.type === 'ellipse' || shape.type === 'blur') {
      const b = getShapeBBox(shape);
      return [
        { id: 'nw', x: b.x1, y: b.y1, cursor: 'nwse-resize' },
        { id: 'ne', x: b.x2, y: b.y1, cursor: 'nesw-resize' },
        { id: 'se', x: b.x2, y: b.y2, cursor: 'nwse-resize' },
        { id: 'sw', x: b.x1, y: b.y2, cursor: 'nesw-resize' }
      ];
    }
    return [];
  }

  // Handle under the point on the currently selected shape, or null. Handles
  // win over the shape body, so a corner grab resizes rather than moves.
  function getHandleAt(x, y) {
    if (activeTool !== 'select') return null;
    if (!selectedShape || !shapes.includes(selectedShape)) return null;
    const r = handleRadius() + 3;
    for (const h of getHandles(selectedShape)) {
      if (Math.hypot(x - h.x, y - h.y) <= r) return h;
    }
    return null;
  }

  // Rewrite the shape's coords so the dragged endpoint handle sits at
  // (x, y). Box corners are handled by the resizeAnchor path in the reshape
  // mousemove instead — they need the opposite corner pinned for the whole
  // gesture, not derived per move.
  function moveHandleTo(shape, handleId, x, y) {
    if (handleId === 'p1') { shape.x1 = x; shape.y1 = y; }
    else if (handleId === 'p2') { shape.x2 = x; shape.y2 = y; }
  }

  // Put a box shape's coords back in x1<=x2, y1<=y2 form after a drag that
  // may have pulled a handle past the opposite edge.
  function normalizeBoxCoords(shape) {
    if (typeof shape.x1 !== 'number' || typeof shape.x2 !== 'number') return;
    if (shape.type === 'arrow' || shape.type === 'line') return; // Direction matters
    if (shape.x1 > shape.x2) { const t = shape.x1; shape.x1 = shape.x2; shape.x2 = t; }
    if (shape.y1 > shape.y2) { const t = shape.y1; shape.y1 = shape.y2; shape.y2 = t; }
  }

  // Remove the selected shape (Delete/Backspace); undoable
  function deleteSelectedShape() {
    if (!selectedShape) return;
    const idx = shapes.indexOf(selectedShape);
    if (idx !== -1) {
      shapes.splice(idx, 1);
      undoStack.push({ type: 'delete', shape: selectedShape, index: idx });
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
    if (!bgImage) return;

    // Close any active textarea first if user clicked elsewhere
    if (activeTextarea) {
      commitActiveText();
      return;
    }

    if (activeTool === 'ai-lens') {
      return; // AI Lens has no canvas drawing behavior
    }

    if (activeTool === 'select') {
      // Select the topmost shape under the cursor, or deselect on empty canvas.
      const sc = getBackingCoords(e.clientX, e.clientY);
      // A handle on the current selection wins over the shape body.
      const handle = getHandleAt(sc.x, sc.y);
      if (handle) {
        resizingHandleId = handle.id;
        resizePrevCoords = {
          x1: selectedShape.x1, y1: selectedShape.y1,
          x2: selectedShape.x2, y2: selectedShape.y2
        };
        // Box handles: pin the opposite corner NOW. Deriving it per
        // mousemove re-inspects the (mutating) coords, so once the pointer
        // crossed the opposite edge the formerly fixed corner would start
        // moving too and the shape would jump.
        if (['nw', 'ne', 'se', 'sw'].includes(handle.id)) {
          const b = getShapeBBox(selectedShape);
          resizeAnchor = {
            nw: { x: b.x2, y: b.y2 }, ne: { x: b.x1, y: b.y2 },
            se: { x: b.x1, y: b.y1 }, sw: { x: b.x2, y: b.y1 }
          }[handle.id];
        } else {
          resizeAnchor = null;
        }
        return;
      }

      const hit = getShapeAt(sc.x, sc.y);
      if (hit) {
        setSelection(hit);
        isDraggingShape = true;
        dragLastX = sc.x;
        dragLastY = sc.y;
        dragTotalDX = 0;
        dragTotalDY = 0;
        if (hit.type === 'text') maybeShowTextEditHint();
      } else {
        setSelection(null);
      }
      drawEverything();
      return;
    }

    // Any new drawing action clears the current selection.
    setSelection(null);

    const coords = getBackingCoords(e.clientX, e.clientY);
    startX = coords.x;
    startY = coords.y;
    currentX = coords.x;
    currentY = coords.y;

    if (activeTool === 'text') {
      // Stop the default mousedown focus shift from blurring the textarea
      // that createTextarea focuses.
      e.preventDefault();
      createTextarea(e.clientX, e.clientY, coords.x, coords.y);
      return;
    }

    isDrawing = true;

    // Initialize shapes
    if (activeTool === 'pen' || activeTool === 'highlighter') {
      // Highlighter shares the pen's Thin/Medium/Thick stroke control, but
      // scaled up 3x so its brush stays visibly broader than the pen's at
      // every setting (Medium/6 preserves the old fixed 18px look).
      const resolvedLineWidth = activeTool === 'highlighter'
        ? activeLineWidth * 3
        : activeLineWidth;
      currentShape = {
        type: activeTool,
        color: activeColor,
        lineWidth: resolvedLineWidth,
        points: [{ x: startX, y: startY }]
      };
    }
    else if (activeTool === 'rect') {
      currentShape = {
        type: 'rect',
        color: activeColor,
        lineWidth: activeLineWidth,
        x1: startX,
        y1: startY,
        x2: startX,
        y2: startY,
        isFilled: activeFill,
        fillColor: activeFillColor
      };
    }
    else if (activeTool === 'ellipse') {
      currentShape = {
        type: 'ellipse',
        color: activeColor,
        lineWidth: activeLineWidth,
        x1: startX,
        y1: startY,
        x2: startX,
        y2: startY,
        isFilled: activeFill,
        fillColor: activeFillColor
      };
    }
    else if (activeTool === 'arrow') {
      currentShape = {
        type: 'arrow',
        color: activeColor,
        lineWidth: activeLineWidth,
        x1: startX,
        y1: startY,
        x2: startX,
        y2: startY
      };
    } 
    else if (activeTool === 'blur') {
      currentShape = {
        type: 'blur',
        x1: startX,
        y1: startY,
        x2: startX,
        y2: startY
      };
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDrawing || !currentShape) return;

    const coords = getBackingCoords(e.clientX, e.clientY);
    currentX = coords.x;
    currentY = coords.y;

    if (currentShape.type === 'pen' || currentShape.type === 'highlighter') {
      currentShape.points.push({ x: currentX, y: currentY });
    } else {
      currentShape.x2 = currentX;
      currentShape.y2 = currentY;
    }

    // Live preview
    drawEverything();
    drawShape(currentShape);
  });

  window.addEventListener('mouseup', (e) => {
    if (!isDrawing) return;
    isDrawing = false;

    if (!currentShape) return;

    const coords = getBackingCoords(e.clientX, e.clientY);
    currentX = coords.x;
    currentY = coords.y;

    if (currentShape.type === 'pen' || currentShape.type === 'highlighter') {
      currentShape.points.push({ x: currentX, y: currentY });
    } else {
      currentShape.x2 = currentX;
      currentShape.y2 = currentY;
    }

    // Verify size / validity threshold to discard click mistakes
    let isValid = false;
    if (currentShape.type === 'pen' || currentShape.type === 'highlighter') {
      isValid = currentShape.points.length > 2;
    } else {
      const distance = Math.sqrt(
        Math.pow(currentShape.x2 - currentShape.x1, 2) + 
        Math.pow(currentShape.y2 - currentShape.y1, 2)
      );
      isValid = distance > 4; // At least 4px dragging vector
    }

    if (isValid) {
      shapes.push(currentShape);
      undoStack.push({ type: 'add', shape: currentShape });
      clearRedoStack();
      updateUndoButton();
    }

    currentShape = null;
    drawEverything();
  });

  // Select-tool reshape drag (handles), kept ahead of drag-to-move so the
  // two never run for the same gesture.
  window.addEventListener('mousemove', (e) => {
    if (!resizingHandleId || !selectedShape) return;
    const coords = getBackingCoords(e.clientX, e.clientY);
    if (resizeAnchor) {
      // Box resize: fixed corner stays pinned, dragged corner follows the
      // pointer. Coords may be inverted mid-drag; normalized on mouseup.
      selectedShape.x1 = resizeAnchor.x;
      selectedShape.y1 = resizeAnchor.y;
      selectedShape.x2 = coords.x;
      selectedShape.y2 = coords.y;
    } else {
      moveHandleTo(selectedShape, resizingHandleId, coords.x, coords.y);
    }
    drawEverything();
  });

  window.addEventListener('mouseup', () => {
    if (!resizingHandleId) return;
    const shape = selectedShape;
    const prev = resizePrevCoords;
    resizingHandleId = null;
    resizePrevCoords = null;
    resizeAnchor = null;
    if (!shape || !prev) return;

    normalizeBoxCoords(shape);

    const moved = shape.x1 !== prev.x1 || shape.y1 !== prev.y1 ||
                  shape.x2 !== prev.x2 || shape.y2 !== prev.y2;
    if (moved) {
      // Its own type (not 'style') so a following restyle can't coalesce
      // into it; undo restores the saved coords either way.
      undoStack.push({ type: 'reshape', shape: shape, prev: prev });
      clearRedoStack();
      updateUndoButton();
    }
    drawEverything();
  });

  // Select-tool drag-to-move (kept separate from the drawing path above)
  window.addEventListener('mousemove', (e) => {
    if (!isDraggingShape || !selectedShape) return;
    const coords = getBackingCoords(e.clientX, e.clientY);
    const dx = coords.x - dragLastX;
    const dy = coords.y - dragLastY;
    if (dx !== 0 || dy !== 0) {
      translateShape(selectedShape, dx, dy);
      dragTotalDX += dx;
      dragTotalDY += dy;
      dragLastX = coords.x;
      dragLastY = coords.y;
      drawEverything();
    }
  });

  window.addEventListener('mouseup', () => {
    if (!isDraggingShape) return;
    isDraggingShape = false;
    // Record the whole drag as one undoable move
    if (selectedShape && (dragTotalDX !== 0 || dragTotalDY !== 0)) {
      undoStack.push({ type: 'move', shape: selectedShape, dx: dragTotalDX, dy: dragTotalDY });
      clearRedoStack();
      updateUndoButton();
    }
    dragTotalDX = 0;
    dragTotalDY = 0;
  });

  // Cursor feedback in Select mode: a resize cursor over a reshape handle,
  // 'text' over a text shape (hints it can be double-clicked to edit),
  // 'move' over any other shape body.
  canvas.addEventListener('mousemove', (e) => {
    if (activeTool !== 'select' || isDraggingShape || resizingHandleId) return;
    const coords = getBackingCoords(e.clientX, e.clientY);
    const handle = getHandleAt(coords.x, coords.y);
    if (handle) {
      canvas.style.cursor = handle.cursor;
      return;
    }
    const hit = getShapeAt(coords.x, coords.y);
    canvas.style.cursor = hit ? (hit.type === 'text' ? 'text' : 'move') : 'default';
  });

  // Double-click a text shape to re-open it for editing. Works regardless of
  // the active tool so the gesture is discoverable outside Select mode too —
  // a stray click from another tool's mousedown/mouseup either never starts a
  // shape (text tool: createTextarea early-returns while activeTextarea is
  // set, and an empty re-committed textarea is simply discarded) or is too
  // small to pass that tool's own validity threshold, so nothing is left
  // behind for the dblclick to collide with.
  canvas.addEventListener('dblclick', (e) => {
    // While another textarea is open, createTextarea would early-return AFTER
    // we spliced the hit shape out of `shapes` — silently losing it. Bail
    // before touching anything.
    if (activeTextarea) return;
    const coords = getBackingCoords(e.clientX, e.clientY);
    const hit = getShapeAt(coords.x, coords.y);
    if (hit && hit.type === 'text') {
      const idx = shapes.indexOf(hit);
      if (idx !== -1) shapes.splice(idx, 1);
      setSelection(null);
      const client = getClientCoords(hit.x1, hit.y1);
      createTextarea(client.x, client.y, hit.x1, hit.y1, hit, idx);
      drawEverything();
    }
  });

  // ==========================================
  // In-place Text Editing Layer
  // ==========================================

  function createTextarea(clientX, clientY, backingX, backingY, sourceShape, sourceIndex) {
    if (activeTextarea) return;

    // When re-editing an existing text shape, preserve its own color/font size.
    const editColor = sourceShape ? sourceShape.color : activeColor;
    const editFontSize = sourceShape ? sourceShape.fontSize : activeFontSize;
    // Re-editing restores the shape's own shadow setting; new shapes take
    // whatever the toggle is currently set to (default off).
    const editShadow = sourceShape ? !!sourceShape.shadow : activeTextShadow;
    if (textShadowCheckbox) textShadowCheckbox.checked = editShadow;

    // Create standard textarea
    const ta = document.createElement('textarea');
    ta.className = 'canvas-text-input';
    // When re-editing, preview the shape's own family; otherwise the active one.
    const editFontFamily = sourceShape
      ? (sourceShape.fontFamily || DEFAULT_FONT_FAMILY)
      : activeFontFamily;

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

    activeTextarea = {
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
    ta.addEventListener('input', () => {
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    });

    // Fit pre-filled multi-line text to its content height
    if (sourceShape) {
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    }

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
    if (!activeTextarea) return;

    const value = activeTextarea.element.value.trim();
    const src = activeTextarea.source;

    if (value) {
      // Record the box's content width in backing coords so drawShape can wrap
      // to the same width the textarea showed. clientWidth includes padding but
      // not the border, so subtract padding to get the true content box width.
      const el = activeTextarea.element;
      const computed = window.getComputedStyle(el);
      const padL = parseFloat(computed.paddingLeft) || 0;
      const padR = parseFloat(computed.paddingRight) || 0;
      const contentWidthDisplay = el.clientWidth - padL - padR;
      const canvasRect = canvas.getBoundingClientRect();
      const backingWidth = contentWidthDisplay * (canvas.width / canvasRect.width);

      let shape;
      if (src) {
        // Re-edit: preserve the original shape's extra properties (e.g.
        // fontFamily) but refresh the wrap width from the (possibly resized)
        // textarea.
        shape = {
          ...src,
          text: value,
          color: activeTextarea.color,
          fontSize: activeTextarea.fontSize,
          fontFamily: activeTextarea.fontFamily,
          shadow: activeTextarea.shadow,
          x1: activeTextarea.backingX,
          y1: activeTextarea.backingY,
          width: backingWidth
        };
      } else {
        shape = {
          type: 'text',
          color: activeColor,
          fontSize: activeFontSize,
          fontFamily: activeFontFamily,
          shadow: activeTextShadow,
          text: value,
          x1: activeTextarea.backingX,
          y1: activeTextarea.backingY,
          width: backingWidth
        };
      }
      // Re-inserting at the original index keeps z-order stable across a re-edit
      if (src && typeof activeTextarea.sourceIndex === 'number') {
        shapes.splice(activeTextarea.sourceIndex, 0, shape);
        undoStack.push({ type: 'replace', oldShape: src, newShape: shape });
      } else {
        shapes.push(shape);
        undoStack.push({ type: 'add', shape: shape });
      }
      clearRedoStack();
      updateUndoButton();
    } else if (src) {
      // Text cleared during a re-edit: leave the original removed (deletion)
      undoStack.push({ type: 'delete', shape: src, index: activeTextarea.sourceIndex || 0 });
      clearRedoStack();
      updateUndoButton();
    }

    cleanupTextarea();
    drawEverything();
  }

  function cancelActiveText() {
    // Restore the original shape if we were re-editing one
    if (activeTextarea && activeTextarea.source && typeof activeTextarea.sourceIndex === 'number') {
      shapes.splice(activeTextarea.sourceIndex, 0, activeTextarea.source);
      updateUndoButton();
    }
    cleanupTextarea();
    drawEverything();
  }

  function cleanupTextarea() {
    if (activeTextarea) {
      if (activeTextarea.element.parentNode) {
        activeTextarea.element.parentNode.removeChild(activeTextarea.element);
      }
      activeTextarea = null;
    }
  }

  // ==========================================
  // Tool & Property Selection Actions
  // ==========================================

  toolButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Commit pending text first if changing tools
      if (activeTextarea) {
        commitActiveText();
      }

      toolButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      activeTool = btn.dataset.tool;

      // Switching tools clears the selection and any hover cursor
      selectedShape = null;
      isDraggingShape = false;
      resizingHandleId = null;
      resizePrevCoords = null;
      resizeAnchor = null;
      canvas.style.cursor = '';

      updatePropertyPanelsVisibility();
      syncPropertyPanelToSelection();
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

    if (activeTool === 'select') {
      // With something selected the panel edits that shape, so show exactly
      // the controls its type honors; with nothing selected there is nothing
      // to style.
      const sel = (selectedShape && shapes.includes(selectedShape)) ? selectedShape : null;
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
    else if (activeTool === 'blur') {
      propColor.classList.add('hidden');
      propStroke.classList.add('hidden');
    } 
    else if (activeTool === 'rect' || activeTool === 'ellipse') {
      propFill.classList.remove('hidden');
    }
    else if (activeTool === 'highlighter') {
      // Highlighter now shares the stroke width control with pen/arrow/rect.
    }
    else if (activeTool === 'text') {
      propStroke.classList.add('hidden');
      propFont.classList.remove('hidden');
    }
    else if (activeTool === 'ai-lens') {
      propColor.classList.add('hidden');
      propStroke.classList.add('hidden');
      propAiLens.classList.remove('hidden');
    }
  }

  const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

  // Expand shorthand #rgb to #rrggbb for the native <input type="color">,
  // which only accepts the 6-digit form.
  function normalizeHex(hex) {
    if (/^#([0-9a-fA-F]{3})$/.test(hex)) {
      return '#' + hex.slice(1).split('').map(c => c + c).join('');
    }
    return hex;
  }

  // Applies the chosen color to the current selection (if any), to the
  // for-new-shapes state, and to any in-progress text edit.
  function applyActiveColor(color, coalesce) {
    activeColor = color;

    if (activeTextarea) {
      activeTextarea.element.style.color = activeColor;
      activeTextarea.color = activeColor; // Commit must honor mid-edit changes
    }

    applyStyleToSelection({ color: color }, coalesce);
  }

  // Clears the "active" state off every swatch and the custom picker so
  // exactly one control reflects the current activeColor at a time.
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
    customColorPicker.addEventListener('input', () => {
      deselectAllColorControls();
      customColorPicker.classList.add('active');
      applyActiveColor(customColorPicker.value, true); // Fires while dragging

      if (customColorHex) {
        customColorHex.value = customColorPicker.value;
        customColorHex.classList.remove('invalid');
      }
    });
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
  const MY_COLORS_KEY = 'snippyMyColors';
  const MY_COLORS_MAX = 6;
  let myColors = [];
  let myColorsLoaded = false; // Gate mutations until the stored set arrives

  function persistMyColors() {
    chrome.storage.local.set({ [MY_COLORS_KEY]: myColors });
  }

  // Mirrors the saved colors into the fill palette so a remembered color is
  // one click away for shape fills too.
  function renderMyColorFills() {
    if (!fillPalette) return;

    const previousActive = fillPalette.querySelector('.my-color-fill.active');
    const previousColor = previousActive ? previousActive.dataset.fillColor : null;
    fillPalette.querySelectorAll('.my-color-fill').forEach(el => el.remove());

    myColors.forEach(color => {
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
    if (previousColor && !myColors.includes(previousColor)) {
      const matchStroke = fillPalette.querySelector('.fill-swatch.match-stroke');
      if (matchStroke) {
        document.querySelectorAll('.fill-swatch.active')
          .forEach(s => s.classList.remove('active'));
        matchStroke.classList.add('active');
        activeFillColor = null;
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
      const color = myColors[i];
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

    renderMyColorFills();
  }

  // Saves the color the panel is currently DISPLAYING into the next free
  // slot: the selected shape's color when one is selected (the panel shows
  // that, not activeColor, which still holds the for-new-shapes value), the
  // active color otherwise. Once all six are full the oldest entry is
  // dropped (FIFO) so "+" always succeeds.
  function saveCurrentColor() {
    if (!myColorsLoaded) return; // Don't clobber storage before the load lands
    const sel = (activeTool === 'select' && selectedShape &&
                 shapes.includes(selectedShape) &&
                 styleAppliesTo(selectedShape, 'color'))
      ? selectedShape.color : activeColor;
    const color = normalizeHex(sel).toLowerCase();
    if (!HEX_COLOR_RE.test(color)) return;

    if (myColors.includes(color)) {
      showToast('That color is already in My Colors.');
      return;
    }

    myColors.push(color);
    if (myColors.length > MY_COLORS_MAX) myColors.shift();

    persistMyColors();
    renderMyColors();
  }

  function removeMyColor(color) {
    if (!myColorsLoaded) return;
    const index = myColors.indexOf(color);
    if (index === -1) return;

    myColors.splice(index, 1);
    persistMyColors();
    renderMyColors();
  }

  async function initMyColors() {
    try {
      const stored = await chrome.storage.local.get([MY_COLORS_KEY]);
      const saved = stored && stored[MY_COLORS_KEY];
      if (Array.isArray(saved)) {
        myColors = saved
          .filter(c => typeof c === 'string' && HEX_COLOR_RE.test(c))
          .slice(0, MY_COLORS_MAX);
      }
    } catch (err) {
      console.error('Failed to load My Colors:', err);
    }
    // Mutations are gated on this so a fast save can't overwrite storage
    // with the empty pre-load array (or be clobbered by the load landing).
    myColorsLoaded = true;
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
      activeLineWidth = parseInt(btn.dataset.width, 10);
      applyStyleToSelection({ lineWidth: activeLineWidth });
    });
  });

  const FONT_SIZE_MIN = 8;
  const FONT_SIZE_MAX = 200;

  // Live-rescale the active textarea to match the current activeFontSize.
  function rescaleActiveTextarea() {
    if (!activeTextarea) return;
    const canvasRect = canvas.getBoundingClientRect();
    const displayFontScale = activeFontSize * (canvasRect.width / canvas.width);
    activeTextarea.element.style.fontSize = `${displayFontScale}px`;
    activeTextarea.fontSize = activeFontSize; // Commit must honor mid-edit changes
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
      activeFontSize = parseInt(btn.dataset.size, 10);
      syncFontSizePresets(activeFontSize);
      if (fontSizeInput) fontSizeInput.value = activeFontSize;
      rescaleActiveTextarea();
      applyStyleToSelection({ fontSize: activeFontSize });
    });
  });

  // Numeric font-size input: typing a custom value deselects the presets
  // (unless it happens to equal one) and drives activeFontSize live.
  if (fontSizeInput) {
    const applyFontSizeInput = (clampDisplay) => {
      let size = parseInt(fontSizeInput.value, 10);
      if (isNaN(size)) {
        if (!clampDisplay) return; // mid-typing empty/invalid: wait
        size = activeFontSize;
      }
      size = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, size));
      if (clampDisplay) fontSizeInput.value = size;
      activeFontSize = size;
      syncFontSizePresets(size);
      rescaleActiveTextarea();
      // Typing fires per keystroke, so fold the whole edit into one undo step.
      applyStyleToSelection({ fontSize: size }, true);
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
      activeFontFamily = fontFamilySelect.value;
      if (activeTextarea) {
        activeTextarea.element.style.fontFamily = activeFontFamily;
        activeTextarea.element.style.fontWeight = fontWeightForFamily(activeFontFamily);
        activeTextarea.fontFamily = activeFontFamily; // Commit must honor mid-edit changes
      }
      applyStyleToSelection({ fontFamily: activeFontFamily });
    });
  }

  // Toggle solid fills
  fillCheckbox.addEventListener('change', (e) => {
    activeFill = e.target.checked;
    applyStyleToSelection({ isFilled: activeFill });
  });

  // Text shadow toggle: default off, per-shape, previewed live while editing.
  // Also restyles a selected text shape, like the other panel controls.
  if (textShadowCheckbox) {
    textShadowCheckbox.addEventListener('change', (e) => {
      activeTextShadow = e.target.checked;
      if (activeTextarea) {
        activeTextarea.shadow = activeTextShadow;
        activeTextarea.element.style.textShadow =
          activeTextShadow ? '1.5px 1.5px rgba(0, 0, 0, 0.5)' : 'none';
      }
      applyStyleToSelection({ shadow: activeTextShadow });
    });
  }

  // Independent fill color swatches (separate from the stroke color palette).
  // Queried live so the mirrored My Colors fill swatches take part too.
  function activateFillSwatch(swatch) {
    document.querySelectorAll('.fill-swatch.active')
      .forEach(s => s.classList.remove('active'));
    swatch.classList.add('active');
    // Empty data-fill-color means "match stroke" -> null
    activeFillColor = swatch.dataset.fillColor || null;
    applyStyleToSelection({ fillColor: activeFillColor });
  }

  fillSwatches.forEach(swatch => {
    swatch.addEventListener('click', () => activateFillSwatch(swatch));
  });

  // ==========================================
  // Properties Panel <-> Selected Shape
  // ==========================================

  // Which style properties a given shape type actually honors. Drives both
  // apply-to-selection and which panel groups are shown for a selection, so
  // e.g. a color click with a blur region selected is a no-op.
  function styleAppliesTo(shape, key) {
    if (key === 'color') {
      return shape.type !== 'blur';
    }
    if (key === 'lineWidth') {
      return shape.type !== 'blur' && shape.type !== 'text';
    }
    if (key === 'isFilled' || key === 'fillColor') {
      return shape.type === 'rect' || shape.type === 'ellipse';
    }
    if (key === 'fontSize' || key === 'fontFamily' || key === 'shadow') {
      return shape.type === 'text';
    }
    return false;
  }

  // Continuous controls (number input, native color picker) coalesce their
  // per-event style entries into one undo step — but only within a single
  // gesture. Each control ends its gesture (on change/blur) by bumping this
  // token, so a NEW drag or typing burst never folds into an old entry and
  // Undo can't revert two unrelated edits at once.
  let styleGestureId = 0;
  function endStyleGesture() {
    styleGestureId++;
  }

  // Restyle the current selection in place. `props` uses panel-level values;
  // properties the shape type ignores are dropped. Undoable as one
  // {type:'style'} entry. Pass coalesce=true for controls that fire
  // continuously so a single gesture doesn't bury the undo stack in
  // one-pixel steps (see styleGestureId above for the gesture bounds).
  function applyStyleToSelection(props, coalesce) {
    if (activeTool !== 'select') return;
    if (!selectedShape || !shapes.includes(selectedShape)) return;

    const shape = selectedShape;
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
      changed = true;
    }

    if (!changed) {
      drawEverything(); // Selection outline may still need refreshing
      return;
    }

    const top = undoStack[undoStack.length - 1];
    if (coalesce && top && top.type === 'style' && top.shape === shape &&
        top.gesture === styleGestureId) {
      // Fold into the in-progress gesture, keeping the oldest value per key.
      for (const key of Object.keys(prev)) {
        if (!(key in top.prev)) top.prev[key] = prev[key];
      }
    } else {
      undoStack.push({
        type: 'style', shape: shape, prev: prev,
        gesture: coalesce ? styleGestureId : null
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
    if (!matched && customColorPicker) {
      customColorPicker.classList.add('active');
      if (HEX_COLOR_RE.test(String(color))) {
        customColorPicker.value = normalizeHex(String(color));
      }
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
    const sel = (selectedShape && shapes.includes(selectedShape)) ? selectedShape : null;

    if (!sel) {
      syncColorControls(activeColor);
      syncStrokeControls(activeLineWidth);
      syncFillControls(activeFill, activeFillColor);
      syncFontControls(activeFontSize, activeFontFamily, activeTextShadow);
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
  // follows it. (withSelectionSuppressed deliberately bypasses this: it
  // hides selection chrome for export without touching the UI.)
  function setSelection(shape) {
    selectedShape = shape || null;
    updatePropertyPanelsVisibility();
    syncPropertyPanelToSelection();
  }

  // ==========================================
  // Action Buttons: Undo, Redo, Clear, Save, Copy
  // ==========================================

  function updateUndoButton() {
    btnUndo.disabled = undoStack.length === 0;
  }

  function updateRedoButton() {
    btnRedo.disabled = redoStack.length === 0;
  }

  // Undo last action (add, delete, move, text re-edit, or full clear)
  btnUndo.addEventListener('click', () => {
    if (activeTextarea) {
      cancelActiveText();
      return;
    }

    const entry = undoStack.pop();
    if (!entry) return;

    if (entry.type === 'add') {
      const idx = shapes.indexOf(entry.shape);
      if (idx !== -1) shapes.splice(idx, 1);
      if (selectedShape === entry.shape) selectedShape = null;
    }
    else if (entry.type === 'delete') {
      shapes.splice(Math.min(entry.index, shapes.length), 0, entry.shape);
    }
    else if (entry.type === 'move') {
      translateShape(entry.shape, -entry.dx, -entry.dy);
    }
    else if (entry.type === 'replace') {
      const idx = shapes.indexOf(entry.newShape);
      if (idx !== -1) shapes.splice(idx, 1, entry.oldShape);
      if (selectedShape === entry.newShape) selectedShape = null;
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
      shapes = [...entry.shapes];
      showToast('All annotations restored!');
    }

    // The same entry re-applies forward when Redo is pressed next.
    redoStack.push(entry);

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
    if (activeTextarea) {
      cancelActiveText();
      return;
    }

    const entry = redoStack.pop();
    if (!entry) return;

    if (entry.type === 'add') {
      shapes.push(entry.shape);
    }
    else if (entry.type === 'delete') {
      const idx = shapes.indexOf(entry.shape);
      if (idx !== -1) shapes.splice(idx, 1);
      if (selectedShape === entry.shape) selectedShape = null;
    }
    else if (entry.type === 'move') {
      translateShape(entry.shape, entry.dx, entry.dy);
    }
    else if (entry.type === 'replace') {
      const idx = shapes.indexOf(entry.oldShape);
      if (idx !== -1) shapes.splice(idx, 1, entry.newShape);
      if (selectedShape === entry.oldShape) selectedShape = null;
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
      shapes = [];
      setSelection(null); // The selected shape (if any) was just wiped
    }

    // Re-push onto undoStack so it can be undone again.
    undoStack.push(entry);

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
    if (activeTextarea) commitActiveText();
    if (shapes.length === 0) return;

    undoStack.push({ type: 'clear', shapes: [...shapes] });
    clearRedoStack();
    shapes = [];
    setSelection(null);

    updateUndoButton();
    drawEverything();
    showToast('Annotations cleared. Press Undo to restore.');
  });

  // Redraw without selection chrome while fn runs so exports (which snapshot
  // the canvas bitmap synchronously) never include the dashed outline.
  function withSelectionSuppressed(fn) {
    const sel = selectedShape;
    if (sel) {
      selectedShape = null;
      drawEverything();
    }
    try {
      fn();
    } finally {
      if (sel) {
        selectedShape = sel;
        drawEverything();
      }
    }
  }

  // Copy to Clipboard (Modern Async API)
  btnCopy.addEventListener('click', () => {
    if (activeTextarea) commitActiveText();

    // toBlob captures the bitmap at call time, so suppressing selection
    // around the synchronous call is sufficient.
    withSelectionSuppressed(() => canvas.toBlob(async (blob) => {
      if (!blob) {
        showToast('Failed to copy. Draw a selection first!');
        return;
      }
      
      try {
        // Stamp the source page URL as a PNG iTXt chunk; fail open so a
        // metadata problem never blocks the copy itself. The ClipboardItem
        // is constructed synchronously with a Promise payload so the write
        // stays within the click's user-activation window.
        const pngPromise = (async () => {
          if (!sourceUrl) return blob;
          try {
            const bytes = new Uint8Array(await blob.arrayBuffer());
            return new Blob([embedSourceInPng(bytes, sourceUrl)], { type: 'image/png' });
          } catch (err) {
            console.error('PNG metadata embed failed, copying without it:', err);
            return blob;
          }
        })();
        const item = new ClipboardItem({ 'image/png': pngPromise });
        await navigator.clipboard.write([item]);
        showToast('Annotated image copied to clipboard!');
      } catch (err) {
        console.error('Clipboard write failed:', err);
        showToast('Clipboard copy failed. Try again or check browser permissions.');
      }
    }, 'image/png'));
  });

  // ==========================================
  // Source-URL Metadata Embedding (JPEG XMP / PNG iTXt)
  // ==========================================

  function xmlEscape(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  // Minimal XMP packet carrying the capture source URL (dc:source) and time.
  // Readable with e.g. `exiftool -XMP:Source file.jpg`.
  function buildXmpPacket(url) {
    return '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
      '<x:xmpmeta xmlns:x="adobe:ns:meta/">' +
      '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
      '<rdf:Description rdf:about=""' +
      ' xmlns:dc="http://purl.org/dc/elements/1.1/"' +
      ' xmlns:xmp="http://ns.adobe.com/xap/1.0/">' +
      `<dc:source>${xmlEscape(url)}</dc:source>` +
      `<xmp:CreateDate>${new Date().toISOString()}</xmp:CreateDate>` +
      '</rdf:Description></rdf:RDF></x:xmpmeta>' +
      '<?xpacket end="w"?>';
  }

  function dataUrlToBytes(dataUrl) {
    const bin = atob(dataUrl.split(',')[1]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function bytesToBase64(bytes) {
    let bin = '';
    const CHUNK = 0x8000; // String.fromCharCode has an argument-count limit
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }

  // Insert an APP1/XMP segment into JPEG bytes, after SOI and any existing
  // APPn segments. Returns the input unchanged if anything looks off.
  function embedXmpInJpeg(bytes, url) {
    if (bytes.length < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return bytes;

    const payload = new TextEncoder().encode(
      'http://ns.adobe.com/xap/1.0/\u0000' + buildXmpPacket(url)
    );
    const segLen = payload.length + 2; // includes the two length bytes
    if (segLen > 0xFFFF) return bytes;

    const seg = new Uint8Array(4 + payload.length);
    seg[0] = 0xFF;
    seg[1] = 0xE1;
    seg[2] = (segLen >> 8) & 0xFF;
    seg[3] = segLen & 0xFF;
    seg.set(payload, 4);

    // Skip past existing APPn segments (JFIF/ICC blocks canvas emits),
    // bailing out on malformed segment lengths rather than reading past
    // the end of the buffer.
    let pos = 2;
    while (pos + 4 <= bytes.length && bytes[pos] === 0xFF &&
           bytes[pos + 1] >= 0xE0 && bytes[pos + 1] <= 0xEF) {
      const len = (bytes[pos + 2] << 8) | bytes[pos + 3];
      if (len < 2 || pos + 2 + len > bytes.length) return bytes;
      pos += 2 + len;
    }

    const out = new Uint8Array(bytes.length + seg.length);
    out.set(bytes.subarray(0, pos), 0);
    out.set(seg, pos);
    out.set(bytes.subarray(pos), pos + seg.length);
    return out;
  }

  // CRC32 as used by PNG chunk checksums
  const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
      c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    }
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // Insert an iTXt chunk (keyword "Source", UTF-8) right after IHDR.
  // Readable with e.g. `exiftool -PNG:Source file.png`.
  function embedSourceInPng(bytes, url) {
    const ihdrEnd = 8 + 4 + 4 + 13 + 4; // signature + IHDR chunk
    if (bytes.length < ihdrEnd) return bytes;

    const enc = new TextEncoder();
    // iTXt layout: keyword \0 compressionFlag compressionMethod lang \0 translatedKeyword \0 text
    const data = enc.encode('Source\u0000\u0000\u0000\u0000\u0000' + url);
    const type = enc.encode('iTXt');

    const chunk = new Uint8Array(4 + 4 + data.length + 4);
    const dv = new DataView(chunk.buffer);
    dv.setUint32(0, data.length);
    chunk.set(type, 4);
    chunk.set(data, 8);
    const crcInput = new Uint8Array(4 + data.length);
    crcInput.set(type, 0);
    crcInput.set(data, 4);
    dv.setUint32(8 + data.length, crc32(crcInput));

    const out = new Uint8Array(bytes.length + chunk.length);
    out.set(bytes.subarray(0, ihdrEnd), 0);
    out.set(chunk, ihdrEnd);
    out.set(bytes.subarray(ihdrEnd), ihdrEnd + chunk.length);
    return out;
  }

  // Composite the annotated canvas over a solid white backdrop and return a
  // JPEG data URL. Callers wrap this in withSelectionSuppressed().
  function buildExportJpegUrl() {
    const downloadCanvas = document.createElement('canvas');
    downloadCanvas.width = canvas.width;
    downloadCanvas.height = canvas.height;

    const downloadCtx = downloadCanvas.getContext('2d');

    // Fill pure white backdrop
    downloadCtx.fillStyle = '#ffffff';
    downloadCtx.fillRect(0, 0, downloadCanvas.width, downloadCanvas.height);

    // Composite edited canvas image
    downloadCtx.drawImage(canvas, 0, 0);

    const jpegUrl = downloadCanvas.toDataURL('image/jpeg', 0.95); // High quality compression

    // Stamp the capture's source page URL into the JPEG as XMP metadata.
    // Fail open: a metadata problem must never block the export itself.
    if (sourceUrl) {
      try {
        const stamped = embedXmpInJpeg(dataUrlToBytes(jpegUrl), sourceUrl);
        return 'data:image/jpeg;base64,' + bytesToBase64(stamped);
      } catch (err) {
        console.error('XMP embed failed, exporting without metadata:', err);
      }
    }
    return jpegUrl;
  }

  // Download JPEG format
  btnSave.addEventListener('click', () => {
    if (activeTextarea) commitActiveText();
    if (!canvas.width || !canvas.height) return;
    withSelectionSuppressed(() => {
      try {
        const jpegUrl = buildExportJpegUrl();
        const link = document.createElement('a');
        link.download = `snippy_${Date.now()}.jpg`;
        link.href = jpegUrl;
        link.click();
        showToast('JPEG saved successfully!');
      } catch (err) {
        console.error('JPEG download failed:', err);
        showToast('Failed to export JPEG.');
      }
    });
  });

  // Once the download actually completes (not merely once a filename is
  // known — a download can still be interrupted after that), copy the
  // absolute path to the clipboard. Mirrors waitForDownloadPath in
  // background.js (no build step, so the two contexts can't share code).
  function copyDownloadPathWhenReady(downloadId) {
    let done = false;
    let candidatePath = null;
    const finish = (path) => {
      if (done) return; // onChanged and the initial search can race
      done = true;
      chrome.downloads.onChanged.removeListener(onChanged);
      if (!path) {
        showToast('Saved, but could not determine the file path.');
        return;
      }
      navigator.clipboard.writeText(path)
        .then(() => showToast('JPEG saved — file path copied to clipboard!'))
        .catch((err) => {
          console.error('Path copy failed:', err);
          showToast(`Saved to ${path}, but the clipboard copy failed.`);
        });
    };
    // Cancelled/failed terminal outcome, routed through the same done guard
    // as finish() so onChanged and the initial search can't both settle.
    const failInterrupted = () => {
      if (done) return;
      done = true;
      chrome.downloads.onChanged.removeListener(onChanged);
      showToast('Save was cancelled or failed.');
    };

    const onChanged = (delta) => {
      if (delta.id !== downloadId) return;
      if (delta.filename) {
        candidatePath = delta.filename.current;
        // Not terminal on its own — keep listening for the state change.
      }
      if (!delta.state) return;
      if (delta.state.current === 'interrupted') {
        failInterrupted();
      } else if (delta.state.current === 'complete') {
        chrome.downloads.search({ id: downloadId }, (items) => {
          const item = items && items[0];
          // The fresh search result's filename can come back empty even on
          // a completed download; fall back to the last candidate seen
          // rather than discarding it. Mirrors waitForDownloadPath in
          // background.js (no build step, so the two contexts can't share
          // code).
          finish((item && item.filename) || candidatePath);
        });
      }
    };
    chrome.downloads.onChanged.addListener(onChanged);

    // Initial reconciliation: the download may already be complete or
    // interrupted (both terminal), or already have a candidate filename
    // while still in_progress (keep the listener attached in that case).
    // onChanged may already have settled the operation by the time this
    // callback runs, so it returns immediately if done, and routes every
    // terminal outcome through the same done-guarded finish()/
    // failInterrupted() used above instead of toasting directly — avoids a
    // stale/duplicate toast. Mirrors waitForDownloadPath in background.js.
    chrome.downloads.search({ id: downloadId }, (items) => {
      if (done) return;
      const item = items && items[0];
      if (!item) return;
      if (item.state === 'interrupted') {
        failInterrupted();
        return;
      }
      if (item.state === 'complete') {
        finish((item && item.filename) || candidatePath);
        return;
      }
      if (item.filename) candidatePath = item.filename;
    });
  }

  // Save JPEG AND copy its absolute path — for pasting the file straight
  // into a terminal (e.g. a Claude/Codex chat).
  btnSavePath.addEventListener('click', () => {
    if (activeTextarea) commitActiveText();
    if (!canvas.width || !canvas.height) return;

    if (!chrome.downloads) {
      // Permission was added in manifest 1.0.x; an unreloaded extension won't have it yet.
      showToast('Downloads permission unavailable — reload the extension.');
      return;
    }

    let jpegUrl = null;
    withSelectionSuppressed(() => {
      try {
        jpegUrl = buildExportJpegUrl();
      } catch (err) {
        console.error('JPEG export failed:', err);
      }
    });
    if (!jpegUrl) {
      showToast('Failed to export JPEG.');
      return;
    }

    // Save into a dedicated scratch subfolder. saveAs: false skips the
    // picker dialog UNLESS the browser's "Ask where to save each file"
    // setting is on — then Chrome still shows a dialog preselecting
    // snippy.tmp, and a user who redirects the save elsewhere gets a file
    // the cleanup sweep will NOT delete (only the registry entry expires).
    // Chrome only allows downloads inside the Downloads directory and
    // rejects hidden (dot-prefixed) components, so Downloads/snippy.tmp
    // is the closest thing to a /tmp drop zone.
    chrome.downloads.download(
      {
        url: jpegUrl,
        filename: `snippy.tmp/snippy_${Date.now()}.jpg`,
        saveAs: false,
        conflictAction: 'uniquify'
      },
      (downloadId) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          console.error('Download failed:', chrome.runtime.lastError);
          showToast('Failed to save JPEG.');
          return;
        }
        // Register in the shared temp registry so the background sweep can
        // clean this file up after ~24h (same registry as quick snips). The
        // registry lives in the service worker so all mutations serialize
        // through its lock; editor.js must not write it directly.
        chrome.runtime.sendMessage({ action: 'register_tmp_download', downloadId }, () => {
          void chrome.runtime.lastError; // fire-and-forget
        });
        copyDownloadPathWhenReady(downloadId);
      }
    );
  });

  // ==========================================
  // Helper Utility: Elegant Toast Notification
  // ==========================================
  
  let toastTimeout = null;
  function showToast(message) {
    if (toastTimeout) {
      clearTimeout(toastTimeout);
    }
    toastMessage.textContent = message;
    toast.classList.add('show');

    toastTimeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }

  // One-time discoverability nudge: the first time a user selects a text
  // shape, remind them double-click reopens it for editing. Persisted in
  // localStorage (editor-page-local, no cross-context sync needed) so it
  // only ever shows once per browser profile.
  const TEXT_EDIT_HINT_KEY = 'snippy_textEditHintShown';
  function maybeShowTextEditHint() {
    try {
      if (localStorage.getItem(TEXT_EDIT_HINT_KEY)) return;
      localStorage.setItem(TEXT_EDIT_HINT_KEY, '1');
    } catch (e) {
      // Storage unavailable (e.g. private mode) — show the hint anyway,
      // just without persistence across sessions.
    }
    showToast('Double-click text to edit');
  }

  // ==========================================
  // AI Lens Integration (Gemini & Vertex AI)
  // ==========================================
  let geminiProvider = 'aistudio'; // aistudio or vertex
  let geminiApiKey = '';
  let geminiProjectId = '';
  let geminiRegion = 'us-central1';
  let geminiModelId = 'gemini-2.5-flash';

  // Toggle setup fields based on provider choice
  aiProviderSelect.addEventListener('change', () => {
    const provider = aiProviderSelect.value;
    updateProviderInputs(provider);
  });

  function updateProviderInputs(provider) {
    if (provider === 'aistudio') {
      containerApiKey.classList.remove('hidden');
      containerProjectId.classList.add('hidden');
      containerRegion.classList.add('hidden');
      aiKeyLink.classList.remove('hidden');
      aiKeyLink.href = 'https://aistudio.google.com/';
      aiKeyLink.textContent = 'Get a free API Key →';
      document.getElementById('label-api-key').textContent = 'Gemini API Key';
      aiKeyInput.placeholder = 'Paste Gemini API Key...';
    } else {
      containerApiKey.classList.remove('hidden');
      containerProjectId.classList.remove('hidden');
      containerRegion.classList.remove('hidden');
      aiKeyLink.classList.add('hidden');
      document.getElementById('label-api-key').textContent = 'GCP API Key / OAuth Token';
      aiKeyInput.placeholder = 'Paste GCP Key or Access Token...';
    }
  }

  // Initial Key & Configuration Check
  async function initAiLens() {
    try {
      const stored = await chrome.storage.local.get([
        'geminiProvider',
        'geminiApiKey',
        'geminiProjectId',
        'geminiRegion',
        'geminiModelId'
      ]);

      if (stored && stored.geminiApiKey) {
        geminiProvider = stored.geminiProvider || 'aistudio';
        geminiApiKey = stored.geminiApiKey;
        geminiProjectId = stored.geminiProjectId || '';
        geminiRegion = stored.geminiRegion || 'us-central1';
        geminiModelId = stored.geminiModelId || 'gemini-2.5-flash';
        
        showAiActivePanel();
      } else {
        showAiSetupPanel();
      }
    } catch (err) {
      console.error('Failed to load AI config:', err);
      showAiSetupPanel();
    }
  }

  function showAiSetupPanel() {
    if (aiLockedState) aiLockedState.classList.remove('hidden');
    aiSetupContainer.classList.add('hidden');
    aiActiveContainer.classList.add('hidden');
    
    // Set field values
    aiProviderSelect.value = geminiProvider;
    aiKeyInput.value = geminiApiKey;
    aiProjectInput.value = geminiProjectId;
    aiRegionInput.value = geminiRegion;
    aiModelInput.value = geminiModelId;
    updateProviderInputs(geminiProvider);

    if (toolAiLens) {
      toolAiLens.classList.remove('has-creds');
      toolAiLens.classList.remove('provider-vertex');
    }
  }

  function showAiActivePanel() {
    if (aiLockedState) aiLockedState.classList.add('hidden');
    aiSetupContainer.classList.add('hidden');
    aiActiveContainer.classList.remove('hidden');
    
    // Nice status indicator update text
    const statusText = document.querySelector('.ai-status-text');
    if (geminiProvider === 'vertex') {
      statusText.textContent = `Vertex: ${geminiModelId} (${geminiRegion})`;
      statusText.style.color = '#a5b4fc'; // Light blue color for Vertex
      document.querySelector('.ai-status-indicator').style.backgroundColor = '#6366f1';
      document.querySelector('.ai-status-indicator').style.boxShadow = '0 0 10px rgba(99, 102, 241, 0.6)';
    } else {
      statusText.textContent = `AI Studio: ${geminiModelId}`;
      statusText.style.color = '#a7f3d0'; // Green color for AI Studio
      document.querySelector('.ai-status-indicator').style.backgroundColor = 'var(--success)';
      document.querySelector('.ai-status-indicator').style.boxShadow = '0 0 10px rgba(16, 185, 129, 0.6)';
    }
    
    aiKeyInput.value = ''; // Clear secret from memory input field

    if (toolAiLens) {
      toolAiLens.classList.add('has-creds');
      toolAiLens.classList.toggle('provider-vertex', geminiProvider === 'vertex');
    }
  }

  // Toggle active setup entry form
  if (btnUnlockAi) {
    btnUnlockAi.addEventListener('click', () => {
      if (aiLockedState) aiLockedState.classList.add('hidden');
      aiSetupContainer.classList.remove('hidden');
    });
  }

  if (btnCloseSetup) {
    btnCloseSetup.addEventListener('click', () => {
      aiSetupContainer.classList.add('hidden');
      if (aiLockedState) aiLockedState.classList.remove('hidden');
    });
  }

  // Save Configuration
  btnSaveKey.addEventListener('click', async () => {
    const provider = aiProviderSelect.value;
    const key = aiKeyInput.value.trim();
    const projectId = aiProjectInput.value.trim();
    const region = aiRegionInput.value.trim() || 'us-central1';
    const modelId = aiModelInput.value.trim() || 'gemini-2.5-flash';

    if (!key) {
      showToast('Please provide an API Key or Token.');
      return;
    }

    if (provider === 'vertex' && !projectId) {
      showToast('Please enter a Google Cloud Project ID.');
      return;
    }
    
    try {
      const config = {
        geminiProvider: provider,
        geminiApiKey: key,
        geminiProjectId: projectId,
        geminiRegion: region,
        geminiModelId: modelId
      };

      await chrome.storage.local.set(config);
      
      geminiProvider = provider;
      geminiApiKey = key;
      geminiProjectId = projectId;
      geminiRegion = region;
      geminiModelId = modelId;

      showAiActivePanel();
      showToast(`${provider === 'vertex' ? 'Vertex AI' : 'AI Studio'} config saved!`);
    } catch (err) {
      console.error('Failed to save AI config:', err);
      showToast('Error saving configuration.');
    }
  });

  // Reset Configuration
  btnResetKey.addEventListener('click', async () => {
    try {
      await chrome.storage.local.remove([
        'geminiProvider',
        'geminiApiKey',
        'geminiProjectId',
        'geminiRegion',
        'geminiModelId'
      ]);
      geminiApiKey = '';
      geminiProjectId = '';
      geminiModelId = 'gemini-2.5-flash';
      showAiSetupPanel();
      
      // Auto-reveal the edit form immediately for editing
      if (aiLockedState) aiLockedState.classList.add('hidden');
      aiSetupContainer.classList.remove('hidden');

      aiOutputCard.classList.add('hidden');
      aiOutputText.textContent = '';
      showToast('Configuration cleared.');
    } catch (err) {
      console.error('Failed to clear config:', err);
    }
  });

  // Call Gemini/Vertex API
  async function queryGemini(promptText) {
    if (!geminiApiKey) {
      showToast('Configuration is missing. Authenticate in Settings.');
      return;
    }

    if (activeTextarea) commitActiveText();

    // Show loading indicator
    aiOutputCard.classList.remove('hidden');
    aiOutputText.innerHTML = `
      <div class="ai-loading-indicator">
        <span class="ai-spinner"></span>
        <span>Analyzing with ${geminiProvider === 'vertex' ? 'Vertex AI' : 'Gemini AI'}...</span>
      </div>
    `;

    try {
      // Get current JPEG base64 from canvas
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const base64Data = dataUrl.split(',')[1];

      let url = '';
      const headers = { 'Content-Type': 'application/json' };

      // Choose endpoint routing template
      if (geminiProvider === 'aistudio') {
        url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModelId}:generateContent?key=${geminiApiKey}`;
      } else {
        // Vertex AI support: Check if token is OAuth or API Key
        // GCP OAuth access tokens always start with 'ya29.'
        // Standard API keys (AIza...) and Agent Builder keys (AQ...) are standard API keys
        const isOAuthToken = geminiApiKey.startsWith('ya29.');

        // Vertex AI endpoint using configurable modelId. The 'global'
        // location uses the bare aiplatform host — 'global-aiplatform...'
        // is not a real endpoint; regional locations use a region prefix.
        const vertexHost = geminiRegion === 'global'
          ? 'aiplatform.googleapis.com'
          : `${geminiRegion}-aiplatform.googleapis.com`;
        url = `https://${vertexHost}/v1/projects/${geminiProjectId}/locations/${geminiRegion}/publishers/google/models/${geminiModelId}:generateContent`;
        if (isOAuthToken) {
          headers['Authorization'] = `Bearer ${geminiApiKey}`;
        } else {
          url += `?key=${geminiApiKey}`;
        }
      }

      // Structure exact common Gemini API schema payload (role is mandatory in Vertex!)
      const payload = {
        contents: [
          {
            role: 'user',
            parts: [
              { text: promptText },
              {
                inlineData: {
                  mimeType: 'image/jpeg',
                  data: base64Data
                }
              }
            ]
          }
        ]
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Extract common error shapes
        const errorMessage = errorData.error?.message || errorData[0]?.error?.message || `HTTP Error ${response.status}`;
        throw new Error(errorMessage);
      }

      const responseData = await response.json();
      
      // Extract text parts safely
      const part = responseData?.candidates?.[0]?.content?.parts?.[0];
      const textResponse = part?.text;

      if (textResponse) {
        aiOutputText.textContent = textResponse;
        btnAiCopy.disabled = false;
      } else {
        throw new Error('Received an empty response from AI.');
      }

    } catch (err) {
      console.error('AI query failed:', err);
      aiOutputText.innerHTML = `
        <div style="color: #f87171; padding: 4px 0;">
          <strong>Analysis Failed</strong><br>
          <span style="font-size: 11px; opacity: 0.85; line-height: 1.4; display: block; margin-top: 4px;">${err.message || 'Make sure your API key/project config is correct.'}</span>
        </div>
      `;
      btnAiCopy.disabled = true;
    }
  }

  // Bind presets action clicks
  aiActionButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      let promptText = '';

      if (action === 'ocr') {
        promptText = "Perform highly accurate OCR on this image. Extract and return ALL text found in the image. Maintain the exact layout, columns, paragraphs, and list structures as closely as possible. Do NOT include any conversational introduction, summary, or commentary — return ONLY the raw extracted text.";
      } else if (action === 'explain') {
        promptText = "Analyze this screenshot. If it contains a code block, explain what the code does and suggest any micro-improvements. If it is a diagram, chart, user interface, or image, explain its architecture, meaning, and key visual elements concisely.";
      } else if (action === 'translate') {
        promptText = "Analyze this screenshot. Identify any non-English text present, translate it into natural, flowing English, and print the translation clearly. If the text is already in English, provide a clean, proofread transcript with improvements.";
      } else if (action === 'table') {
        promptText = "Locate any tabular grids, lists, pricing plans, or formatted data structures in this image. Parse the row-and-column data and format it into a clean, well-aligned GitHub Markdown table. Do not add intro/outro comments.";
      }

      if (promptText) {
        queryGemini(promptText);
      }
    });
  });

  // Bind custom send action
  btnAiSend.addEventListener('click', () => {
    const customPrompt = aiPromptInput.value.trim();
    if (!customPrompt) return;
    
    queryGemini(customPrompt);
    aiPromptInput.value = ''; // Reset input field
  });

  // Custom send on Enter
  aiPromptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      btnAiSend.click();
    }
  });

  // Copy AI output to clipboard
  btnAiCopy.addEventListener('click', () => {
    const textToCopy = aiOutputText.textContent;
    if (!textToCopy) return;

    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        showToast('AI response copied to clipboard!');
      })
      .catch(err => {
        console.error('Failed to copy AI text:', err);
        showToast('Clipboard copy blocked.');
      });
  });

  // Initialize the AI panel
  initAiLens();

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
      if (selectedShape) {
        e.preventDefault();
        deleteSelectedShape();
      }
    }
    else if (e.key === 'Escape') {
      if (selectedShape) {
        // A reshape or move may be mid-gesture: revert it first, otherwise
        // clearing the selection strands a mutation no undo entry records.
        if (resizingHandleId && resizePrevCoords) {
          Object.assign(selectedShape, resizePrevCoords);
        }
        if (isDraggingShape && (dragTotalDX !== 0 || dragTotalDY !== 0)) {
          translateShape(selectedShape, -dragTotalDX, -dragTotalDY);
        }
        resizingHandleId = null;
        resizePrevCoords = null;
        resizeAnchor = null;
        isDraggingShape = false;
        dragTotalDX = 0;
        dragTotalDY = 0;
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

  // ==========================================
  // Sidebar Resize Interaction
  // ==========================================
  const resizeHandle = document.getElementById('sidebar-resize-handle');
  const rightSidebar = document.querySelector('.right-properties');

  // Load and apply saved sidebar width
  chrome.storage.local.get(['sidebarWidth'], (result) => {
    if (result && result.sidebarWidth) {
      const savedWidth = parseInt(result.sidebarWidth, 10);
      if (savedWidth >= 240 && savedWidth <= 600) {
        rightSidebar.style.width = `${savedWidth}px`;
      }
    }
  });

  if (resizeHandle && rightSidebar) {
    resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      
      resizeHandle.classList.add('active');
      document.body.style.cursor = 'col-resize';
      
      const startX = e.clientX;
      const startWidth = rightSidebar.getBoundingClientRect().width;

      function onMouseMove(moveEvent) {
        const deltaX = moveEvent.clientX - startX;
        // Since the sidebar is on the right, dragging left (negative deltaX) makes it wider.
        let newWidth = startWidth - deltaX;

        // Apply boundary constraints
        if (newWidth < 240) newWidth = 240;
        if (newWidth > 600) newWidth = 600;

        rightSidebar.style.width = `${newWidth}px`;
      }

      function onMouseUp() {
        resizeHandle.classList.remove('active');
        document.body.style.cursor = '';
        
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);

        // Persist the custom sidebar width in local storage
        const currentWidth = rightSidebar.getBoundingClientRect().width;
        chrome.storage.local.set({ sidebarWidth: currentWidth });
      }

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    });
  }

});
