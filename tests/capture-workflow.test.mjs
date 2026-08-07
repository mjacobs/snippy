import test from 'node:test';
import assert from 'node:assert/strict';

import {
  consumeCapture,
  storeCaptureAndOpenEditor
} from '../capture-workflow.mjs';

function createStorage() {
  const values = new Map();
  return {
    values,
    async set(entries) {
      for (const [key, value] of Object.entries(entries)) values.set(key, value);
    },
    async get(key) {
      if (key === null) return Object.fromEntries(values);
      return { [key]: values.get(key) };
    },
    async remove(key) {
      for (const item of Array.isArray(key) ? key : [key]) values.delete(item);
    }
  };
}

test('concurrent captures open editors with distinct storage records', async () => {
  const storage = createStorage();
  const opened = [];
  const ids = ['capture-a', 'capture-b'];
  const dependencies = {
    storage,
    tabs: { async create(options) { opened.push(options.url); } },
    getUrl: path => `chrome-extension://snippy/${path}`,
    randomUUID: () => ids.shift(),
    now: () => 1234
  };

  await Promise.all([
    storeCaptureAndOpenEditor(dependencies, 'data:image/png;base64,AAA', 'https://one.test/'),
    storeCaptureAndOpenEditor(dependencies, 'data:image/png;base64,BBB', 'https://two.test/')
  ]);

  assert.deepEqual(opened.sort(), [
    'chrome-extension://snippy/editor.html?capture=capture-a',
    'chrome-extension://snippy/editor.html?capture=capture-b'
  ]);
  assert.equal(storage.values.size, 2);

  const first = await consumeCapture(storage, '?capture=capture-a');
  const second = await consumeCapture(storage, '?capture=capture-b');
  assert.deepEqual(first, {
    dataUrl: 'data:image/png;base64,AAA',
    sourceUrl: 'https://one.test/',
    capturedAt: 1234
  });
  assert.deepEqual(second, {
    dataUrl: 'data:image/png;base64,BBB',
    sourceUrl: 'https://two.test/',
    capturedAt: 1234
  });
  assert.equal(storage.values.size, 0);
});

test('failed editor creation removes the unconsumed capture record', async () => {
  const storage = createStorage();
  const dependencies = {
    storage,
    tabs: { async create() { throw new Error('tab failed'); } },
    getUrl: path => `chrome-extension://snippy/${path}`,
    randomUUID: () => 'capture-failed',
    now: () => 1234
  };

  await assert.rejects(
    storeCaptureAndOpenEditor(dependencies, 'data:image/png;base64,AAA', ''),
    /tab failed/
  );
  assert.equal(storage.values.size, 0);
});

test('an editor URL without a capture ID does not consume unrelated storage', async () => {
  const storage = createStorage();
  storage.values.set('snippyCapture:keep', { dataUrl: 'keep' });

  assert.equal(await consumeCapture(storage, ''), null);
  assert.equal(storage.values.size, 1);
});

test('a new capture removes legacy and expired screenshot records', async () => {
  const storage = createStorage();
  storage.values.set('activeScreenshot', 'legacy screenshot');
  storage.values.set('screenshotTimestamp', 1);
  storage.values.set('sourceUrl', 'https://legacy.test/');
  storage.values.set('snippyCapture:expired', { capturedAt: 1, dataUrl: 'expired' });
  storage.values.set('snippyCapture:fresh', { capturedAt: 599_999, dataUrl: 'fresh' });

  await storeCaptureAndOpenEditor({
    storage,
    tabs: { async create() {} },
    getUrl: path => `chrome-extension://snippy/${path}`,
    randomUUID: () => 'capture-new',
    now: () => 600_000
  }, 'data:image/png;base64,NEW', '');

  assert.equal(storage.values.has('activeScreenshot'), false);
  assert.equal(storage.values.has('screenshotTimestamp'), false);
  assert.equal(storage.values.has('sourceUrl'), false);
  assert.equal(storage.values.has('snippyCapture:expired'), false);
  assert.equal(storage.values.has('snippyCapture:fresh'), true);
  assert.equal(storage.values.has('snippyCapture:capture-new'), true);
});
