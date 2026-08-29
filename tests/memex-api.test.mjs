import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildMemexRequest,
  extractMemexError,
  isMemexConfigured,
  normalizeEndpoint,
  originPatternFor,
  originPatternForStored,
  sanitizeStoredEndpoint
} from '../memex-api.mjs';

test('endpoints normalize however the user pasted them', () => {
  assert.equal(normalizeEndpoint('https://memex.example.com'), 'https://memex.example.com');
  assert.equal(normalizeEndpoint('  https://memex.example.com/  '), 'https://memex.example.com');
  assert.equal(normalizeEndpoint('https://memex.example.com/api/v1'), 'https://memex.example.com');
  assert.equal(normalizeEndpoint('https://memex.example.com/api/v1/'), 'https://memex.example.com');
  assert.equal(normalizeEndpoint('http://localhost:8780'), 'http://localhost:8780');
  // Credentials and query strings never belong in a stored endpoint.
  assert.equal(normalizeEndpoint('https://u:p@memex.example.com/?x=1'), 'https://memex.example.com');
});

test('unusable endpoints normalize to empty rather than throwing', () => {
  for (const bad of ['', '   ', 'not a url', 'ftp://memex.example.com', null, undefined]) {
    assert.equal(normalizeEndpoint(bad), '');
  }
});

test('cleartext HTTP is refused anywhere but loopback', () => {
  // The device key rides in an Authorization header on every push.
  assert.equal(normalizeEndpoint('http://memex.example.com'), '');
  assert.equal(normalizeEndpoint('http://192.168.1.20:8780'), '');
  assert.equal(normalizeEndpoint('http://LOCALHOST:8780'), 'http://localhost:8780');
  assert.equal(normalizeEndpoint('http://127.0.0.1:8780'), 'http://127.0.0.1:8780');
  // IPv6 loopback has no expressible Chrome match pattern, so it is refused.
  assert.equal(normalizeEndpoint('http://[::1]:8780'), '');
  assert.ok(!isMemexConfigured({ endpoint: 'http://memex.example.com', deviceKey: 'k' }));
});

test('a wildcard host is refused, never turned into a wildcard grant', () => {
  // `https://*` parses, and its origin would make the match pattern
  // `https://*/*` — permission over every https site, not one Memex host.
  for (const wild of ['https://*', 'https://*.example.com', 'https://a*b.example.com']) {
    assert.equal(normalizeEndpoint(wild), '', wild);
    assert.equal(originPatternFor(wild), '', wild);
    assert.equal(originPatternForStored(wild), '', wild);
    assert.ok(!isMemexConfigured({ endpoint: wild, deviceKey: 'k' }), wild);
  }
});

test('a config counts as complete only with both an endpoint and a key', () => {
  assert.ok(isMemexConfigured({ endpoint: 'https://memex.example.com', deviceKey: 'k' }));
  assert.ok(!isMemexConfigured({ endpoint: 'https://memex.example.com', deviceKey: '  ' }));
  assert.ok(!isMemexConfigured({ endpoint: 'nope', deviceKey: 'k' }));
  assert.ok(!isMemexConfigured(null));
});

test('the host permission asked for covers just the deployment origin', () => {
  assert.equal(originPatternFor('https://memex.example.com/api/v1'), 'https://memex.example.com/*');
  assert.equal(originPatternFor('garbage'), '');
});

test('a permission pattern names the host without the port', () => {
  // Chrome rejects a match pattern containing a port, so one there means the
  // save fails outright — while the endpoint we fetch must keep the port.
  assert.equal(originPatternFor('http://localhost:8780/'), 'http://localhost/*');
  assert.equal(originPatternFor('https://memex.example.com:8443'), 'https://memex.example.com/*');
  assert.equal(originPatternForStored('http://127.0.0.1:8780/?t=1'), 'http://127.0.0.1/*');
  for (const pattern of [
    originPatternFor('http://localhost:8780'),
    originPatternFor('https://memex.example.com:8443'),
    originPatternForStored('http://127.0.0.1:8780')
  ]) {
    assert.ok(!/:\d/.test(pattern), `${pattern} must not carry a port`);
  }
  // The endpoint itself keeps its port.
  assert.equal(normalizeEndpoint('http://localhost:8780'), 'http://localhost:8780');
});

test('a stored endpoint stays releasable even once we refuse to push to it', () => {
  // A permission granted for a plain-HTTP host has to be revocable.
  assert.equal(originPatternForStored('http://memex.example.com/?t=1'), 'http://memex.example.com/*');
  // But nothing beyond the origin is kept: no credentials, path, or query.
  assert.equal(
    sanitizeStoredEndpoint('http://u:p@memex.example.com/hook?token=secret#x'),
    'http://memex.example.com'
  );
  assert.equal(sanitizeStoredEndpoint('garbage'), '');
  assert.equal(originPatternFor('http://memex.example.com'), '', 'but never pushed to');
  assert.equal(originPatternForStored('https://memex.example.com/api/v1'), 'https://memex.example.com/*');
  for (const bad of ['', 'garbage', 'ftp://memex.example.com', null]) {
    assert.equal(originPatternForStored(bad), '');
  }
});

test('a push carries the image, the device key, and the page it came from', () => {
  const { url, headers, body } = buildMemexRequest(
    { endpoint: 'https://memex.example.com/', deviceKey: ' dev-key ' },
    {
      imageBase64: 'AAAA',
      mime: 'image/png',
      text: 'compare later',
      sourceUrl: 'https://example.com/pricing',
      title: 'Example — Pricing'
    }
  );

  assert.equal(url, 'https://memex.example.com/api/v1/capture/image');
  assert.deepEqual(headers, {
    'Content-Type': 'application/json',
    Authorization: 'Bearer dev-key'
  });
  assert.deepEqual(body, {
    image_base64: 'AAAA',
    mime: 'image/png',
    source: 'web',
    text: 'compare later',
    source_url: 'https://example.com/pricing',
    title: 'Example — Pricing'
  });
});

test('optional provenance fields are omitted rather than sent empty', () => {
  const { body } = buildMemexRequest(
    { endpoint: 'https://memex.example.com', deviceKey: 'k' },
    { imageBase64: 'AAAA' }
  );
  assert.deepEqual(body, { image_base64: 'AAAA', mime: 'image/png', source: 'web' });
});

test('a config the user still has to fix throws a message worth showing', () => {
  assert.throws(
    () => buildMemexRequest({ endpoint: 'nope', deviceKey: 'k' }, { imageBase64: 'A' }),
    /must start with https/
  );
  assert.throws(
    () => buildMemexRequest({ endpoint: 'https://m.example.com', deviceKey: '' }, { imageBase64: 'A' }),
    /device key is missing/
  );
  assert.throws(
    () => buildMemexRequest({ endpoint: 'https://m.example.com', deviceKey: 'k' }, {}),
    /canvas is empty/
  );
});

test('errors read as Memex wrote them, with a plain 401 message', () => {
  assert.equal(
    extractMemexError({ error: { code: 'payload_too_large', message: 'image exceeds 10 MiB' } }, 413),
    'image exceeds 10 MiB'
  );
  assert.equal(extractMemexError({}, 500), 'HTTP Error 500');
  assert.equal(extractMemexError({ error: { message: 'unknown device key' } }, 401),
    'Memex rejected the device key.');
});
