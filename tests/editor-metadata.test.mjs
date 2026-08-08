import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bytesToBase64,
  crc32,
  dataUrlToBytes,
  embedSourceInPng,
  embedXmpInJpeg,
  sanitizeSourceUrl,
  xmlEscape
} from '../editor-metadata.mjs';

const PNG_SIGNATURE = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

function makePng(trailing = 4) {
  // signature + a 13-byte-payload IHDR chunk + some trailing bytes
  const ihdr = new Uint8Array(4 + 4 + 13 + 4).fill(0x11);
  return Uint8Array.from([...PNG_SIGNATURE, ...ihdr, ...new Array(trailing).fill(0x22)]);
}

function makeJpeg(extraSegments = []) {
  return Uint8Array.from([0xFF, 0xD8, ...extraSegments, 0xFF, 0xDA, 0x00, 0x02]);
}

test('sanitizeSourceUrl keeps origin and path but drops secrets', () => {
  assert.equal(
    sanitizeSourceUrl('https://user:pw@example.com/a/b?token=xyz#frag'),
    'https://example.com/a/b'
  );
});

test('sanitizeSourceUrl rejects non-http(s) and malformed URLs', () => {
  assert.equal(sanitizeSourceUrl('chrome-extension://abc/editor.html'), '');
  assert.equal(sanitizeSourceUrl('file:///etc/passwd'), '');
  assert.equal(sanitizeSourceUrl('not a url'), '');
  assert.equal(sanitizeSourceUrl(undefined), '');
});

test('xmlEscape escapes all five XML metacharacters', () => {
  assert.equal(xmlEscape(`&<>"'`), '&amp;&lt;&gt;&quot;&apos;');
});

test('base64 round-trips through the data-URL helpers', () => {
  const bytes = Uint8Array.from([0, 1, 2, 250, 251, 255]);
  const roundTripped = dataUrlToBytes(`data:image/jpeg;base64,${bytesToBase64(bytes)}`);
  assert.deepEqual(Array.from(roundTripped), Array.from(bytes));
});

test('bytesToBase64 handles payloads larger than the fromCharCode chunk', () => {
  const bytes = new Uint8Array(0x8000 + 5).fill(0x41);
  assert.equal(bytesToBase64(bytes), Buffer.from(bytes).toString('base64'));
});

test('crc32 matches the known PNG check value', () => {
  // "IEND" chunk CRC is a fixed, widely published constant.
  assert.equal(crc32(new TextEncoder().encode('IEND')), 0xAE426082);
});

test('embedXmpInJpeg inserts an APP1 segment after SOI', () => {
  const out = embedXmpInJpeg(makeJpeg(), 'https://example.com/');
  assert.equal(out[0], 0xFF);
  assert.equal(out[1], 0xD8);
  assert.equal(out[2], 0xFF);
  assert.equal(out[3], 0xE1); // APP1
  const segLen = (out[4] << 8) | out[5];
  // Segment length counts its own two bytes plus the payload.
  const payload = out.subarray(6, 4 + segLen);
  const text = new TextDecoder().decode(payload);
  assert.ok(text.startsWith('http://ns.adobe.com/xap/1.0/\u0000'));
  assert.ok(text.includes('<dc:source>https://example.com/</dc:source>'));
});

test('embedXmpInJpeg skips past an existing APPn segment', () => {
  // A 4-byte APP0 (length 0x0004 covers the length bytes + 2 payload bytes)
  const jfif = [0xFF, 0xE0, 0x00, 0x04, 0x00, 0x00];
  const out = embedXmpInJpeg(makeJpeg(jfif), 'https://example.com/');
  assert.deepEqual(Array.from(out.subarray(0, 8)), [0xFF, 0xD8, ...jfif]);
  assert.equal(out[8], 0xFF);
  assert.equal(out[9], 0xE1); // XMP lands after the APP0, not before it
});

test('embedXmpInJpeg fails open on non-JPEG and malformed input', () => {
  const notJpeg = Uint8Array.from([1, 2, 3, 4]);
  assert.equal(embedXmpInJpeg(notJpeg, 'https://example.com/'), notJpeg);

  // APP0 claiming a length that runs past the end of the buffer
  const bad = Uint8Array.from([0xFF, 0xD8, 0xFF, 0xE0, 0xFF, 0xFF, 0x00]);
  assert.equal(embedXmpInJpeg(bad, 'https://example.com/'), bad);
});

test('embedSourceInPng inserts a CRC-correct iTXt chunk after IHDR', () => {
  const url = 'https://example.com/page';
  const png = makePng();
  const out = embedSourceInPng(png, url);

  const ihdrEnd = 8 + 4 + 4 + 13 + 4;
  assert.deepEqual(Array.from(out.subarray(0, ihdrEnd)), Array.from(png.subarray(0, ihdrEnd)));

  const view = new DataView(out.buffer, out.byteOffset);
  const length = view.getUint32(ihdrEnd);
  assert.equal(new TextDecoder().decode(out.subarray(ihdrEnd + 4, ihdrEnd + 8)), 'iTXt');

  const data = out.subarray(ihdrEnd + 8, ihdrEnd + 8 + length);
  assert.equal(new TextDecoder().decode(data), `Source\u0000\u0000\u0000\u0000\u0000${url}`);

  const crcInput = out.subarray(ihdrEnd + 4, ihdrEnd + 8 + length);
  assert.equal(view.getUint32(ihdrEnd + 8 + length), crc32(crcInput));

  // The original trailing bytes survive after the inserted chunk.
  assert.deepEqual(
    Array.from(out.subarray(ihdrEnd + 12 + length)),
    Array.from(png.subarray(ihdrEnd))
  );
});

test('embedSourceInPng fails open on a truncated PNG', () => {
  const short = Uint8Array.from(PNG_SIGNATURE);
  assert.equal(embedSourceInPng(short, 'https://example.com/'), short);
});
