import test from 'node:test';
import assert from 'node:assert/strict';

import {
  effectiveTextBoxWidth,
  resizedTextBoxWidth,
  textBoxResizeHandle
} from '../editor-geometry.mjs';

test('uses a stored wrap width instead of the measured ink width', () => {
  assert.equal(effectiveTextBoxWidth({ width: 240 }, 137), 240);
});

test('legacy text begins at its measured ink width', () => {
  assert.equal(effectiveTextBoxWidth({}, 137), 137);
});

test('horizontal resizing keeps the left edge fixed and clamps to two font sizes', () => {
  const shape = { x1: 100, fontSize: 24 };
  assert.equal(resizedTextBoxWidth(shape, 260), 160);
  assert.equal(resizedTextBoxWidth(shape, 110), 48);
  assert.equal(shape.x1, 100);
});

test('places one east-west handle on the right-edge vertical center', () => {
  const handle = textBoxResizeHandle(
    { x1: 100, y1: 50 },
    { boxWidth: 160, height: 90 }
  );
  assert.deepEqual(handle, {
    id: 'text-e',
    x: 260,
    y: 95,
    cursor: 'ew-resize'
  });
});
