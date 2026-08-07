import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPersistentOnce,
  isHighlighterContext,
  resizeTextareaToContent,
  strokeWidthForTool,
  toolActionForTextHit
} from '../editor-behavior.mjs';
import { wrapTextToWidth } from '../editor-geometry.mjs';

test('wrapped canvas text preserves leading indentation', () => {
  const measureText = text => ({ width: text.length });
  assert.deepEqual(wrapTextToWidth('  alpha beta', 9, measureText), [
    '  alpha',
    'beta'
  ]);
  assert.deepEqual(wrapTextToWidth('    verylong', 3, measureText), [
    '    verylong'
  ]);
});

test('textarea content height is recalculated after width or font changes', () => {
  const textarea = {
    style: { height: '40px' },
    get scrollHeight() {
      assert.equal(this.style.height, 'auto');
      return 88;
    }
  };

  resizeTextareaToContent(textarea);
  assert.equal(textarea.style.height, '88px');
});

test('one-time hints stay suppressed in memory when persistence is unavailable', () => {
  let writes = 0;
  const shouldShow = createPersistentOnce({
    getItem() { throw new Error('storage unavailable'); },
    setItem() { writes++; throw new Error('storage unavailable'); }
  }, 'hint-key');

  assert.equal(shouldShow(), true);
  assert.equal(shouldShow(), false);
  assert.equal(writes, 1);
});

test('text targets reserve text-tool clicks and suppress a second drawing click', () => {
  assert.equal(toolActionForTextHit('text', 1, true), 'suppress');
  assert.equal(toolActionForTextHit('pen', 1, true), 'track');
  assert.equal(toolActionForTextHit('pen', 2, true), 'suppress');
  assert.equal(toolActionForTextHit('pen', 1, false), 'normal');
  assert.equal(toolActionForTextHit('select', 2, true), 'normal');
});

test('highlighter keeps its legacy 18px default without changing the pen width', () => {
  assert.equal(strokeWidthForTool('pen', 3), 3);
  assert.equal(strokeWidthForTool('highlighter', 6), 18);
  assert.equal(isHighlighterContext('highlighter', null), true);
  assert.equal(isHighlighterContext('select', { type: 'highlighter' }), true);
  assert.equal(isHighlighterContext('select', { type: 'pen' }), false);
});
