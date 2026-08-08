// Shape geometry for the Select tool: bounding boxes, hit-testing, reshape
// handles and translation. Pure — the only canvas dependency (measuring text)
// is injected as a `getTextLayout(shape)` callback returning
// {lines, inkWidth, boxWidth, height}.

import { resizedTextBoxWidth, textBoxResizeHandle } from './editor-geometry.mjs';

// Shortest distance from point (px,py) to segment (ax,ay)-(bx,by), backing coords
export function distToSegment(px, py, ax, ay, bx, by) {
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
export function getShapeBBox(shape, getTextLayout) {
  if (shape.type === 'text') {
    const layout = getTextLayout(shape);
    return {
      x1: shape.x1,
      y1: shape.y1,
      x2: shape.x1 + Math.max(layout.inkWidth, layout.boxWidth),
      y2: shape.y1 + layout.height
    };
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

// The box the selection outline is drawn around. For text this is the wrap
// box (so the width handle sits on the edge the user dragged), not the ink.
export function getSelectionBBox(shape, getTextLayout) {
  if (shape.type !== 'text') return getShapeBBox(shape, getTextLayout);
  const layout = getTextLayout(shape);
  return {
    x1: shape.x1,
    y1: shape.y1,
    x2: shape.x1 + layout.boxWidth,
    y2: shape.y1 + layout.height
  };
}

// True if the point (backing coords) hits the shape
export function hitTestShape(shape, x, y, getTextLayout) {
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
  const b = getShapeBBox(shape, getTextLayout);
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

// Translate whichever coordinate fields the shape carries by (dx, dy)
export function translateShape(shape, dx, dy) {
  if (typeof shape.x1 === 'number') { shape.x1 += dx; shape.y1 += dy; }
  if (typeof shape.x2 === 'number') { shape.x2 += dx; shape.y2 += dy; }
  if (shape.points) {
    for (const p of shape.points) { p.x += dx; p.y += dy; }
  }
}

// Reshape handles for a shape, in draw order: endpoints for arrows/lines,
// corners for the box-shaped types. Text has one width handle, while
// pen/highlighter strokes are move-only and return none.
export function getHandles(shape, getTextLayout) {
  if (shape.type === 'text') {
    const layout = getTextLayout(shape);
    return [textBoxResizeHandle(shape, layout)];
  }
  if (shape.type === 'arrow' || shape.type === 'line') {
    return [
      { id: 'p1', x: shape.x1, y: shape.y1, cursor: 'grab' },
      { id: 'p2', x: shape.x2, y: shape.y2, cursor: 'grab' }
    ];
  }
  if (shape.type === 'rect' || shape.type === 'ellipse' || shape.type === 'blur') {
    const b = getShapeBBox(shape, getTextLayout);
    return [
      { id: 'nw', x: b.x1, y: b.y1, cursor: 'nwse-resize' },
      { id: 'ne', x: b.x2, y: b.y1, cursor: 'nesw-resize' },
      { id: 'se', x: b.x2, y: b.y2, cursor: 'nwse-resize' },
      { id: 'sw', x: b.x1, y: b.y2, cursor: 'nesw-resize' }
    ];
  }
  return [];
}

export const BOX_HANDLE_IDS = ['nw', 'ne', 'se', 'sw'];

export function isBoxHandle(handleId) {
  return BOX_HANDLE_IDS.includes(handleId);
}

// The corner a box resize pins in place: the one diagonally opposite the
// dragged handle. Pinned once at mousedown rather than derived per move —
// deriving it re-inspects the (mutating) coords, so once the pointer crossed
// the opposite edge the formerly fixed corner would start moving too.
export function anchorForBoxHandle(bbox, handleId) {
  return {
    nw: { x: bbox.x2, y: bbox.y2 },
    ne: { x: bbox.x1, y: bbox.y2 },
    se: { x: bbox.x1, y: bbox.y1 },
    sw: { x: bbox.x2, y: bbox.y1 }
  }[handleId];
}

// Rewrite the shape's coords so the dragged endpoint handle sits at (x, y).
// Box corners are handled by the anchor path in the reshape mousemove
// instead — they need the opposite corner pinned for the whole gesture.
export function moveHandleTo(shape, handleId, x, y) {
  if (handleId === 'text-e') {
    shape.width = resizedTextBoxWidth(shape, x);
  } else if (handleId === 'p1') { shape.x1 = x; shape.y1 = y; }
  else if (handleId === 'p2') { shape.x2 = x; shape.y2 = y; }
}

// Put a box shape's coords back in x1<=x2, y1<=y2 form after a drag that
// may have pulled a handle past the opposite edge.
export function normalizeBoxCoords(shape) {
  if (typeof shape.x1 !== 'number' || typeof shape.x2 !== 'number') return;
  if (shape.type === 'arrow' || shape.type === 'line') return; // Direction matters
  if (shape.x1 > shape.x2) { const t = shape.x1; shape.x1 = shape.x2; shape.x2 = t; }
  if (shape.y1 > shape.y2) { const t = shape.y1; shape.y1 = shape.y2; shape.y2 = t; }
}

// Which style properties a given shape type actually honors. Drives both
// apply-to-selection and which panel groups are shown for a selection, so
// e.g. a color click with a blur region selected is a no-op.
export function styleAppliesTo(shape, key) {
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
