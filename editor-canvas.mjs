// Everything that touches the 2D context: sizing the canvas to the capture,
// rendering the background plus every shape, measuring text, and converting
// between viewport and backing-store coordinates.
//
// createRenderer() closes over the canvas and the shared state object, so the
// functions it returns take the same arguments the rest of the editor already
// passed them.

import { effectiveTextBoxWidth, wrapTextToWidth as wrapTextToMeasuredWidth }
  from './editor-geometry.mjs';
import {
  getHandles as shapeHandles,
  getSelectionBBox as shapeSelectionBBox,
  getShapeBBox as shapeBBox,
  hitTestShape as shapeHitTest
} from './editor-shapes.mjs';
import { DEFAULT_FONT_FAMILY } from './editor-state.mjs';

export function createRenderer({ canvas, ctx, state, imgDimensions }) {
  // Set up Canvas dimensions
  function setupCanvas() {
    if (!state.bgImage) return;

    // Set backing resolution to match the image exactly
    canvas.width = state.bgImage.naturalWidth;
    canvas.height = state.bgImage.naturalHeight;

    // Update header info tag
    imgDimensions.textContent = `${state.bgImage.naturalWidth} × ${state.bgImage.naturalHeight} px`;

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
    if (!ctx || !state.bgImage) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background screenshot
    ctx.drawImage(state.bgImage, 0, 0);

    // Draw all shapes in history
    for (const shape of state.shapes) {
      drawShape(shape);
    }

    // Draw the selection outline on top (Select tool only)
    if (state.activeTool === 'select' && state.selectedShape && state.shapes.includes(state.selectedShape)) {
      drawSelectionOutline(state.selectedShape);
    }
  }

  // Dashed selection rectangle around the selected shape's bounding box,
  // plus any reshape handles the shape type supports. This is selection
  // chrome only: exports run through withSelectionSuppressed, which clears
  // selectedShape and redraws, so none of it reaches the saved image.
  function drawSelectionOutline(shape) {
    const b = getSelectionBBox(shape);
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
    return wrapTextToMeasuredWidth(text, maxWidth, value => ctx.measureText(value));
  }

  function getTextLayout(shape) {
    ctx.save();
    ctx.font = fontString(shape.fontSize, shape.fontFamily || DEFAULT_FONT_FAMILY);
    const lines = [];
    for (const paragraph of String(shape.text).split('\n')) {
      if (shape.width) lines.push(...wrapTextToWidth(paragraph, shape.width));
      else lines.push(paragraph);
    }
    let inkWidth = 0;
    for (const line of lines) inkWidth = Math.max(inkWidth, ctx.measureText(line).width);
    ctx.restore();

    return {
      lines,
      inkWidth,
      boxWidth: effectiveTextBoxWidth(shape, inkWidth),
      height: shape.fontSize * 1.25 * lines.length
    };
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
        tempCtx.drawImage(state.bgImage, bx, by, bw, bh, 0, 0, sw, sh);

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
      const { lines } = getTextLayout(shape);

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

  // editor-shapes.mjs is canvas-free, so it takes text measurement as a
  // callback. These adapters bind getTextLayout once, so callers pass only
  // the shape.
  function getShapeBBox(shape) { return shapeBBox(shape, getTextLayout); }
  function getSelectionBBox(shape) { return shapeSelectionBBox(shape, getTextLayout); }
  function hitTestShape(shape, x, y) { return shapeHitTest(shape, x, y, getTextLayout); }
  function getHandles(shape) { return shapeHandles(shape, getTextLayout); }

  // Handles are drawn in backing coords but should stay a constant size on
  // screen, so scale the radius by however much the canvas is displayed down
  // (or up) from its backing resolution.
  function handleRadius() {
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width > 0 ? canvas.width / rect.width : 1;
    return Math.max(4, 6 * scale);
  }

  return {
    drawEverything,
    drawShape,
    fontString,
    fontWeightForFamily,
    getBackingCoords,
    getClientCoords,
    getHandles,
    getSelectionBBox,
    getShapeBBox,
    getTextLayout,
    handleRadius,
    hitTestShape,
    setupCanvas
  };
}
