import test from 'node:test';
import assert from 'node:assert/strict';
import { createNumberMarker, numberLabelColor, numberMarkerRadius } from '../editor-number.mjs';
import { getShapeBBox, getHandles, hitTestShape, styleAppliesTo, translateShape } from '../editor-shapes.mjs';

test('numbering follows the highest remaining marker without renumbering gaps', () => {
  const shapes = [{ type: 'text', number: 99 }];
  const first = createNumberMarker(shapes, 50, 60);
  assert.equal(first.number, 1);
  assert.equal(first.color, '#ff3b30');
  shapes.push(first);
  const second = createNumberMarker(shapes, 100, 60);
  shapes.push(second);
  const third = createNumberMarker(shapes, 150, 60);
  shapes.push(third);
  assert.deepEqual(shapes.slice(1).map(s => s.number), [1, 2, 3]);
  shapes.splice(2, 1);
  assert.equal(createNumberMarker(shapes, 0, 0).number, 4);
  assert.equal(third.number, 3, 'removing 2 does not change 3');
  shapes.pop();
  assert.equal(createNumberMarker(shapes, 0, 0).number, 2);
  assert.equal(createNumberMarker([], 0, 0).number, 1);
});

test('markers select by their circle and move without changing the label or size', () => {
  const marker = createNumberMarker([], 50, 60);
  assert.deepEqual(getShapeBBox(marker), { x1: 34, y1: 44, x2: 66, y2: 76 });
  assert.equal(hitTestShape(marker, 50, 60), true);
  assert.equal(hitTestShape(marker, 66, 60), true);
  assert.equal(hitTestShape(marker, 72, 82), false, 'outside the circle, within the padded box');
  assert.deepEqual(getHandles(marker), []);
  translateShape(marker, 20, -10);
  assert.deepEqual([marker.x1, marker.y1, marker.number], [70, 50, 1]);
  assert.deepEqual(getShapeBBox(marker), { x1: 54, y1: 34, x2: 86, y2: 66 });
  assert.equal(styleAppliesTo(marker, 'color'), true);
  for (const key of ['lineWidth', 'fontSize', 'fontFamily', 'shadow', 'isFilled', 'fillColor']) {
    assert.equal(styleAppliesTo(marker, key), false, key);
  }
});

test('multiple digits get room in both the rendered circle and the hit target', () => {
  const marker = { type: 'number', number: 100, x1: 40, y1: 40 };
  assert.ok(numberMarkerRadius(marker) > numberMarkerRadius({ number: 1 }));
  assert.equal(getShapeBBox(marker).x2, 40 + numberMarkerRadius(marker));
  assert.equal(hitTestShape(marker, 40 + numberMarkerRadius(marker), 40), true);
});

test('number labels contrast with red, light, dark and shorthand colors', () => {
  for (const color of ['#ff3b30', '#ffffff', '#ffcc00', '#fff']) {
    assert.equal(numberLabelColor(color), '#000000', color);
  }
  for (const color of ['#000000', '#0000ff', '#123', '#000']) {
    assert.equal(numberLabelColor(color), '#ffffff', color);
  }
});
