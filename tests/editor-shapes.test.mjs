import test from 'node:test';
import assert from 'node:assert/strict';

import {
  anchorForBoxHandle,
  distToSegment,
  getHandles,
  getSelectionBBox,
  getShapeBBox,
  hitTestShape,
  isBoxHandle,
  moveHandleTo,
  normalizeBoxCoords,
  styleAppliesTo,
  translateShape
} from '../editor-shapes.mjs';

// Stand-in for the canvas-backed layout: 10px per character, 1.25 line height.
function fakeTextLayout(shape) {
  const lines = String(shape.text).split('\n');
  const inkWidth = Math.max(...lines.map(l => l.length * 10));
  return {
    lines,
    inkWidth,
    boxWidth: (Number.isFinite(shape.width) && shape.width > 0) ? shape.width : inkWidth,
    height: shape.fontSize * 1.25 * lines.length
  };
}

test('distToSegment clamps to the segment endpoints', () => {
  assert.equal(distToSegment(0, 0, 10, 0, 20, 0), 10); // before the start
  assert.equal(distToSegment(30, 0, 10, 0, 20, 0), 10); // past the end
  assert.equal(distToSegment(15, 5, 10, 0, 20, 0), 5); // perpendicular
  assert.equal(distToSegment(3, 4, 0, 0, 0, 0), 5); // degenerate segment
});

test('getShapeBBox normalizes inverted box coordinates', () => {
  const bbox = getShapeBBox({ type: 'rect', x1: 40, y1: 30, x2: 10, y2: 5 });
  assert.deepEqual(bbox, { x1: 10, y1: 5, x2: 40, y2: 30 });
});

test('getShapeBBox spans every point of a freehand stroke', () => {
  const shape = { type: 'pen', points: [{ x: 5, y: 9 }, { x: 1, y: 20 }, { x: 12, y: 3 }] };
  assert.deepEqual(getShapeBBox(shape), { x1: 1, y1: 3, x2: 12, y2: 20 });
});

test('text bbox uses the wider of ink and box; selection bbox uses the box', () => {
  // Wrap box narrower than the ink (a word that cannot be broken)
  const narrow = { type: 'text', text: 'abcdefgh', fontSize: 20, x1: 100, y1: 50, width: 30 };
  assert.deepEqual(getShapeBBox(narrow, fakeTextLayout), { x1: 100, y1: 50, x2: 180, y2: 75 });
  assert.deepEqual(getSelectionBBox(narrow, fakeTextLayout), { x1: 100, y1: 50, x2: 130, y2: 75 });

  // Wrap box wider than the ink (the user dragged the handle out)
  const wide = { type: 'text', text: 'ab', fontSize: 20, x1: 0, y1: 0, width: 200 };
  assert.equal(getShapeBBox(wide, fakeTextLayout).x2, 200);
  assert.equal(getSelectionBBox(wide, fakeTextLayout).x2, 200);
});

test('hitTestShape tracks an arrow along its shaft, within tolerance', () => {
  const arrow = { type: 'arrow', x1: 0, y1: 0, x2: 100, y2: 0, lineWidth: 4 };
  assert.equal(hitTestShape(arrow, 50, 0), true);
  assert.equal(hitTestShape(arrow, 50, 7), true); // within lineWidth/2 + 6
  assert.equal(hitTestShape(arrow, 50, 20), false);
});

test('a hollow rect is selectable only on its outline ring', () => {
  const hollow = { type: 'rect', x1: 0, y1: 0, x2: 100, y2: 100, lineWidth: 4, isFilled: false };
  assert.equal(hitTestShape(hollow, 0, 50), true); // on the left edge
  assert.equal(hitTestShape(hollow, 50, 50), false); // through the empty middle
});

test('a filled rect is selectable anywhere inside it', () => {
  const filled = { type: 'rect', x1: 0, y1: 0, x2: 100, y2: 100, lineWidth: 4, isFilled: true };
  assert.equal(hitTestShape(filled, 50, 50), true);
  assert.equal(hitTestShape(filled, 150, 50), false);
});

test('a hollow ellipse is selectable only on its rim', () => {
  const ring = { type: 'ellipse', x1: 0, y1: 0, x2: 200, y2: 200, lineWidth: 4, isFilled: false };
  assert.equal(hitTestShape(ring, 100, 0), true); // top of the rim
  assert.equal(hitTestShape(ring, 100, 100), false); // dead centre
  assert.equal(hitTestShape(ring, 10, 10), false); // bbox corner, outside the rim
});

test('hitTestShape walks every segment of a freehand stroke', () => {
  const pen = { type: 'pen', lineWidth: 2, points: [{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }] };
  assert.equal(hitTestShape(pen, 0, 50), true);
  assert.equal(hitTestShape(pen, 50, 100), true);
  assert.equal(hitTestShape(pen, 50, 50), false); // inside the L, not on it
});

test('translateShape moves endpoints and every stroke point', () => {
  const box = { type: 'rect', x1: 1, y1: 2, x2: 3, y2: 4 };
  translateShape(box, 10, 20);
  assert.deepEqual(box, { type: 'rect', x1: 11, y1: 22, x2: 13, y2: 24 });

  const pen = { type: 'pen', points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] };
  translateShape(pen, -1, 2);
  assert.deepEqual(pen.points, [{ x: -1, y: 2 }, { x: 4, y: 7 }]);
});

test('getHandles returns the shape-appropriate set', () => {
  assert.deepEqual(
    getHandles({ type: 'arrow', x1: 0, y1: 0, x2: 10, y2: 10 }).map(h => h.id),
    ['p1', 'p2']
  );
  assert.deepEqual(
    getHandles({ type: 'rect', x1: 0, y1: 0, x2: 10, y2: 10 }).map(h => h.id),
    ['nw', 'ne', 'se', 'sw']
  );
  assert.deepEqual(
    getHandles({ type: 'text', text: 'hi', fontSize: 10, x1: 0, y1: 0 }, fakeTextLayout)
      .map(h => h.id),
    ['text-e']
  );
  assert.deepEqual(getHandles({ type: 'pen', points: [{ x: 0, y: 0 }] }), []);
  assert.deepEqual(getHandles({ type: 'highlighter', points: [{ x: 0, y: 0 }] }), []);
});

test('anchorForBoxHandle pins the diagonally opposite corner', () => {
  const b = { x1: 10, y1: 20, x2: 110, y2: 220 };
  assert.deepEqual(anchorForBoxHandle(b, 'nw'), { x: 110, y: 220 });
  assert.deepEqual(anchorForBoxHandle(b, 'ne'), { x: 10, y: 220 });
  assert.deepEqual(anchorForBoxHandle(b, 'se'), { x: 10, y: 20 });
  assert.deepEqual(anchorForBoxHandle(b, 'sw'), { x: 110, y: 20 });
  assert.equal(isBoxHandle('se'), true);
  assert.equal(isBoxHandle('text-e'), false);
});

test('moveHandleTo rewrites only the dragged endpoint', () => {
  const arrow = { type: 'arrow', x1: 0, y1: 0, x2: 10, y2: 10 };
  moveHandleTo(arrow, 'p2', 99, 98);
  assert.deepEqual(arrow, { type: 'arrow', x1: 0, y1: 0, x2: 99, y2: 98 });

  // Text width is clamped to two font sizes by resizedTextBoxWidth
  const text = { type: 'text', fontSize: 20, x1: 100, y1: 0, width: 300 };
  moveHandleTo(text, 'text-e', 400);
  assert.equal(text.width, 300);
  moveHandleTo(text, 'text-e', 101);
  assert.equal(text.width, 40);
});

test('normalizeBoxCoords reorders boxes but preserves arrow direction', () => {
  const box = { type: 'rect', x1: 50, y1: 60, x2: 10, y2: 20 };
  normalizeBoxCoords(box);
  assert.deepEqual(box, { type: 'rect', x1: 10, y1: 20, x2: 50, y2: 60 });

  const arrow = { type: 'arrow', x1: 50, y1: 60, x2: 10, y2: 20 };
  normalizeBoxCoords(arrow);
  assert.deepEqual(arrow, { type: 'arrow', x1: 50, y1: 60, x2: 10, y2: 20 });

  const pen = { type: 'pen', points: [{ x: 0, y: 0 }] };
  normalizeBoxCoords(pen); // no x1/x2: must not throw
  assert.deepEqual(pen, { type: 'pen', points: [{ x: 0, y: 0 }] });
});

test('styleAppliesTo gates each property by shape type', () => {
  const cases = [
    ['rect', 'color', true], ['blur', 'color', false],
    ['text', 'lineWidth', false], ['blur', 'lineWidth', false], ['pen', 'lineWidth', true],
    ['rect', 'isFilled', true], ['ellipse', 'fillColor', true], ['arrow', 'isFilled', false],
    ['text', 'fontSize', true], ['text', 'shadow', true], ['rect', 'fontFamily', false],
    ['text', 'nonsense', false]
  ];
  for (const [type, key, expected] of cases) {
    assert.equal(styleAppliesTo({ type }, key), expected, `${type}.${key}`);
  }
});
