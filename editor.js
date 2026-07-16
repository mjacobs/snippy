// Snippy Image Editor

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const canvas = document.getElementById('editor-canvas');
  const canvasWrapper = document.getElementById('canvas-wrapper');
  const imgDimensions = document.getElementById('image-dimensions');
  
  // Action buttons
  const btnUndo = document.getElementById('btn-undo');
  const btnClear = document.getElementById('btn-clear');
  const btnCopy = document.getElementById('btn-copy');
  const btnSave = document.getElementById('btn-save');
  
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
  const strokeButtons = document.querySelectorAll('.stroke-btn');
  const fillCheckbox = document.getElementById('fill-checkbox');
  const fillSwatches = document.querySelectorAll('.fill-swatch');
  const fontSizeButtons = document.querySelectorAll('.font-size-btn');
  const fontSizeInput = document.getElementById('font-size-input');
  const fontFamilySelect = document.getElementById('font-family-select');

  // Toast
  const toast = document.getElementById('toast');
  const toastMessage = toast.querySelector('.toast-message');

  // Canvas context
  const ctx = canvas.getContext('2d');
  
  // Editor State
  let bgImage = null;
  let shapes = [];
  let clearedShapesBackup = null; // Backup to undo a Clear action
  
  let activeTool = 'select'; // select, pen, arrow, rect, highlighter, blur, text
  let activeColor = '#ff3b30'; // Red default
  let activeLineWidth = 3; // Thin
  let activeFontSize = 24; // Medium
  const DEFAULT_FONT_FAMILY = "'Inter', -apple-system, sans-serif";
  let activeFontFamily = DEFAULT_FONT_FAMILY;
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

  // 1. Load active screenshot from storage
  try {
    const data = await chrome.storage.local.get('activeScreenshot');
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

  // Dashed selection rectangle around the selected shape's bounding box
  function drawSelectionOutline(shape) {
    const b = getShapeBBox(shape);
    const pad = 4;
    ctx.save();
    ctx.strokeStyle = '#007aff';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(b.x1 - pad, b.y1 - pad, (b.x2 - b.x1) + pad * 2, (b.y2 - b.y1) + pad * 2);
    ctx.restore();
  }

  // Inter/Outfit are bold display faces; serif/mono/cursive read better at
  // normal weight, so pick the weight to match the family.
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
        // Drop shadow for readability
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillText(line, shape.x1 + 1.5, textY + 1.5);
        
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
    return x >= b.x1 - tol && x <= b.x2 + tol && y >= b.y1 - tol && y <= b.y2 + tol;
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

  // Remove the selected shape (Delete/Backspace); Undo semantics unchanged
  function deleteSelectedShape() {
    if (!selectedShape) return;
    const idx = shapes.indexOf(selectedShape);
    if (idx !== -1) shapes.splice(idx, 1);
    selectedShape = null;
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
      const hit = getShapeAt(sc.x, sc.y);
      if (hit) {
        selectedShape = hit;
        isDraggingShape = true;
        dragLastX = sc.x;
        dragLastY = sc.y;
      } else {
        selectedShape = null;
      }
      drawEverything();
      return;
    }

    // Any new drawing action clears the current selection.
    selectedShape = null;

    const coords = getBackingCoords(e.clientX, e.clientY);
    startX = coords.x;
    startY = coords.y;
    currentX = coords.x;
    currentY = coords.y;

    if (activeTool === 'text') {
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
      clearedShapesBackup = null; // Discard clear backup once a new shape is drawn
      updateUndoButton();
    }

    currentShape = null;
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
      dragLastX = coords.x;
      dragLastY = coords.y;
      drawEverything();
    }
  });

  window.addEventListener('mouseup', () => {
    if (isDraggingShape) isDraggingShape = false;
  });

  // Cursor feedback: 'move' when hovering a shape in Select mode
  canvas.addEventListener('mousemove', (e) => {
    if (activeTool !== 'select' || isDraggingShape) return;
    const coords = getBackingCoords(e.clientX, e.clientY);
    canvas.style.cursor = getShapeAt(coords.x, coords.y) ? 'move' : 'default';
  });

  // Double-click a text shape in Select mode to re-open it for editing
  canvas.addEventListener('dblclick', (e) => {
    if (activeTool !== 'select') return;
    const coords = getBackingCoords(e.clientX, e.clientY);
    const hit = getShapeAt(coords.x, coords.y);
    if (hit && hit.type === 'text') {
      const idx = shapes.indexOf(hit);
      if (idx !== -1) shapes.splice(idx, 1);
      selectedShape = null;
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
          text: value,
          x1: activeTextarea.backingX,
          y1: activeTextarea.backingY,
          width: backingWidth
        };
      }
      // Re-inserting at the original index keeps z-order stable across a re-edit
      if (src && typeof activeTextarea.sourceIndex === 'number') {
        shapes.splice(activeTextarea.sourceIndex, 0, shape);
      } else {
        shapes.push(shape);
      }
      clearedShapesBackup = null;
      updateUndoButton();
    } else if (src) {
      // Text cleared during a re-edit: leave the original removed (deletion)
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
      canvas.style.cursor = '';

      updatePropertyPanelsVisibility();
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
      propColor.classList.add('hidden');
      propStroke.classList.add('hidden');
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

  // Applies the chosen color and live-updates any in-progress text edit.
  function applyActiveColor(color) {
    activeColor = color;

    if (activeTextarea) {
      activeTextarea.element.style.color = activeColor;
    }
  }

  // Clears the "active" state off every swatch and the custom picker so
  // exactly one control reflects the current activeColor at a time.
  function deselectAllColorControls() {
    colorSwatches.forEach(s => s.classList.remove('active'));
    if (customColorPicker) customColorPicker.classList.remove('active');
  }

  // Color selection swatches
  colorSwatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      deselectAllColorControls();
      swatch.classList.add('active');
      applyActiveColor(swatch.dataset.color);

      // Clear any pending custom hex input now that a swatch won out.
      if (customColorHex) {
        customColorHex.value = '';
        customColorHex.classList.remove('invalid');
      }
    });
  });

  // Custom color: native swatch picker
  if (customColorPicker) {
    customColorPicker.addEventListener('input', () => {
      deselectAllColorControls();
      customColorPicker.classList.add('active');
      applyActiveColor(customColorPicker.value);

      if (customColorHex) {
        customColorHex.value = customColorPicker.value;
        customColorHex.classList.remove('invalid');
      }
    });
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

  // Stroke line width options
  strokeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      strokeButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeLineWidth = parseInt(btn.dataset.width, 10);
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
    };

    fontSizeInput.addEventListener('input', () => applyFontSizeInput(false));
    fontSizeInput.addEventListener('change', () => applyFontSizeInput(true));
  }

  // Font family picker: updates state and previews on the active textarea.
  if (fontFamilySelect) {
    fontFamilySelect.addEventListener('change', () => {
      activeFontFamily = fontFamilySelect.value;
      if (activeTextarea) {
        activeTextarea.element.style.fontFamily = activeFontFamily;
        activeTextarea.element.style.fontWeight = fontWeightForFamily(activeFontFamily);
      }
    });
  }

  // Toggle solid fills
  fillCheckbox.addEventListener('change', (e) => {
    activeFill = e.target.checked;
  });

  // Independent fill color swatches (separate from the stroke color palette)
  fillSwatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      fillSwatches.forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      // Empty data-fill-color means "match stroke" -> null
      activeFillColor = swatch.dataset.fillColor || null;
    });
  });

  // ==========================================
  // Action Buttons: Undo, Clear, Save, Copy
  // ==========================================

  function updateUndoButton() {
    btnUndo.disabled = (shapes.length === 0 && clearedShapesBackup === null);
  }

  // Undo last action (or restore after a complete clear)
  btnUndo.addEventListener('click', () => {
    if (activeTextarea) {
      cancelActiveText();
      return;
    }

    if (shapes.length === 0 && clearedShapesBackup !== null) {
      // Undo a Clear action: Restore all backup shapes
      shapes = [...clearedShapesBackup];
      clearedShapesBackup = null;
      showToast('All annotations restored!');
    } else if (shapes.length > 0) {
      // Normal Undo: Remove last drawn shape
      shapes.pop();
    }

    updateUndoButton();
    drawEverything();
  });

  // Clear all annotations instantly
  btnClear.addEventListener('click', () => {
    if (shapes.length === 0) return;
    
    // Backup for immediate Undo rescue
    clearedShapesBackup = [...shapes];
    shapes = [];
    
    updateUndoButton();
    drawEverything();
    showToast('Annotations cleared. Press Undo to restore.');
  });

  // Copy to Clipboard (Modern Async API)
  btnCopy.addEventListener('click', () => {
    if (activeTextarea) commitActiveText();
    
    canvas.toBlob(async (blob) => {
      if (!blob) {
        showToast('Failed to copy. Draw a selection first!');
        return;
      }
      
      try {
        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
        showToast('Annotated image copied to clipboard!');
      } catch (err) {
        console.error('Clipboard write failed:', err);
        showToast('Clipboard copy failed. Try again or check browser permissions.');
      }
    }, 'image/png');
  });

  // Download JPEG format
  btnSave.addEventListener('click', () => {
    if (activeTextarea) commitActiveText();
    if (!canvas.width || !canvas.height) return;

    // Create an offscreen canvas to paint solid white backdrop under JPEG to preserve transparency clean
    const downloadCanvas = document.createElement('canvas');
    downloadCanvas.width = canvas.width;
    downloadCanvas.height = canvas.height;
    
    const downloadCtx = downloadCanvas.getContext('2d');
    
    // Fill pure white backdrop
    downloadCtx.fillStyle = '#ffffff';
    downloadCtx.fillRect(0, 0, downloadCanvas.width, downloadCanvas.height);
    
    // Composite edited canvas image
    downloadCtx.drawImage(canvas, 0, 0);

    try {
      const jpegUrl = downloadCanvas.toDataURL('image/jpeg', 0.95); // High quality compression
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
        
        // Vertex AI endpoint using configurable modelId
        if (isOAuthToken) {
          url = `https://${geminiRegion}-aiplatform.googleapis.com/v1/projects/${geminiProjectId}/locations/${geminiRegion}/publishers/google/models/${geminiModelId}:generateContent`;
          headers['Authorization'] = `Bearer ${geminiApiKey}`;
        } else {
          url = `https://${geminiRegion}-aiplatform.googleapis.com/v1/projects/${geminiProjectId}/locations/${geminiRegion}/publishers/google/models/${geminiModelId}:generateContent?key=${geminiApiKey}`;
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
    // If typing in textarea, don't trigger shortcuts
    if (document.activeElement && document.activeElement.tagName === 'TEXTAREA') {
      return;
    }

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const ctrlKey = isMac ? e.metaKey : e.ctrlKey;

    if (ctrlKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      btnUndo.click();
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
        // First Escape just clears the selection
        selectedShape = null;
        drawEverything();
      } else {
        // Otherwise fall back to switching to the Select tool
        toolButtons[0].click();
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
