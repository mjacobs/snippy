import test from 'node:test';
import assert from 'node:assert/strict';

import {
  AI_PRESET_PROMPTS,
  analyzingLabel,
  buildGeminiEndpoint,
  buildGeminiPayload,
  extractErrorMessage,
  extractResponseText,
  promptForPresetAction,
  providerLabel
} from '../ai-lens-api.mjs';

test('every preset action the panel offers has a prompt', () => {
  for (const action of ['ocr', 'explain', 'translate', 'table']) {
    assert.equal(typeof AI_PRESET_PROMPTS[action], 'string');
    assert.ok(promptForPresetAction(action).length > 0);
  }
  assert.equal(promptForPresetAction('not-an-action'), '');
});

test('provider labels distinguish the setup panel from the spinner', () => {
  assert.equal(providerLabel('vertex'), 'Vertex AI');
  assert.equal(providerLabel('aistudio'), 'AI Studio');
  assert.equal(analyzingLabel('vertex'), 'Vertex AI');
  assert.equal(analyzingLabel('aistudio'), 'Gemini AI');
});

test('AI Studio requests go to generativelanguage with the key in the query', () => {
  const { url, headers } = buildGeminiEndpoint({
    provider: 'aistudio',
    apiKey: 'AIzaTEST',
    modelId: 'gemini-2.5-flash'
  });
  assert.equal(
    url,
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=AIzaTEST'
  );
  assert.deepEqual(headers, { 'Content-Type': 'application/json' });
});

test('regional Vertex requests use a region-prefixed host', () => {
  const { url } = buildGeminiEndpoint({
    provider: 'vertex',
    apiKey: 'AIzaTEST',
    projectId: 'my-proj',
    region: 'us-central1',
    modelId: 'gemini-2.5-pro'
  });
  assert.equal(
    url,
    'https://us-central1-aiplatform.googleapis.com/v1/projects/my-proj/locations/us-central1/publishers/google/models/gemini-2.5-pro:generateContent?key=AIzaTEST'
  );
});

test('the global Vertex location uses the bare aiplatform host', () => {
  const { url } = buildGeminiEndpoint({
    provider: 'vertex',
    apiKey: 'AIzaTEST',
    projectId: 'my-proj',
    region: 'global',
    modelId: 'gemini-2.5-pro'
  });
  assert.ok(url.startsWith('https://aiplatform.googleapis.com/v1/projects/my-proj/locations/global/'));
});

test('an OAuth token authenticates via the header, never the query string', () => {
  const { url, headers } = buildGeminiEndpoint({
    provider: 'vertex',
    apiKey: 'ya29.SECRET',
    projectId: 'my-proj',
    region: 'us-central1',
    modelId: 'gemini-2.5-flash'
  });
  assert.ok(!url.includes('key='));
  assert.ok(!url.includes('ya29.'));
  assert.equal(headers.Authorization, 'Bearer ya29.SECRET');
});

test('the payload carries the prompt and the inline JPEG under a user role', () => {
  const payload = buildGeminiPayload('describe this', 'BASE64DATA');
  assert.deepEqual(payload, {
    contents: [{
      role: 'user',
      parts: [
        { text: 'describe this' },
        { inlineData: { mimeType: 'image/jpeg', data: 'BASE64DATA' } }
      ]
    }]
  });
});

test('extractResponseText survives every missing level of the response', () => {
  assert.equal(extractResponseText({ candidates: [{ content: { parts: [{ text: 'hi' }] } }] }), 'hi');
  assert.equal(extractResponseText({ candidates: [] }), undefined);
  assert.equal(extractResponseText({}), undefined);
  assert.equal(extractResponseText(undefined), undefined);
});

test('extractErrorMessage handles both API error shapes and falls back to status', () => {
  assert.equal(extractErrorMessage({ error: { message: 'bad key' } }, 403), 'bad key');
  assert.equal(extractErrorMessage([{ error: { message: 'vertex says no' } }], 400), 'vertex says no');
  assert.equal(extractErrorMessage({}, 500), 'HTTP Error 500');
});
