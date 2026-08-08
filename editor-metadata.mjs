// Source-URL provenance: sanitizing the capture URL and stamping it into
// exported images (JPEG XMP / PNG iTXt). Pure byte/string work — no DOM.

// Provenance metadata must not leak secrets when a screenshot is shared:
// keep only http(s) URLs, drop credentials, fragments, and the entire query
// string — param names can't be trusted to reveal which values are secret.
// The path is kept deliberately: origin-only provenance is too coarse to be
// useful, and the path rarely carries secrets compared to the query.
export function sanitizeSourceUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    u.username = '';
    u.password = '';
    u.hash = '';
    u.search = '';
    return u.toString();
  } catch (err) {
    return '';
  }
}

export function xmlEscape(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Minimal XMP packet carrying the capture source URL (dc:source) and time.
// Readable with e.g. `exiftool -XMP:Source file.jpg`.
export function buildXmpPacket(url) {
  return '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">' +
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
    '<rdf:Description rdf:about=""' +
    ' xmlns:dc="http://purl.org/dc/elements/1.1/"' +
    ' xmlns:xmp="http://ns.adobe.com/xap/1.0/">' +
    `<dc:source>${xmlEscape(url)}</dc:source>` +
    `<xmp:CreateDate>${new Date().toISOString()}</xmp:CreateDate>` +
    '</rdf:Description></rdf:RDF></x:xmpmeta>' +
    '<?xpacket end="w"?>';
}

export function dataUrlToBytes(dataUrl) {
  const bin = atob(dataUrl.split(',')[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export function bytesToBase64(bytes) {
  let bin = '';
  const CHUNK = 0x8000; // String.fromCharCode has an argument-count limit
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

// Insert an APP1/XMP segment into JPEG bytes, after SOI and any existing
// APPn segments. Returns the input unchanged if anything looks off.
export function embedXmpInJpeg(bytes, url) {
  if (bytes.length < 4 || bytes[0] !== 0xFF || bytes[1] !== 0xD8) return bytes;

  const payload = new TextEncoder().encode(
    'http://ns.adobe.com/xap/1.0/\u0000' + buildXmpPacket(url)
  );
  const segLen = payload.length + 2; // includes the two length bytes
  if (segLen > 0xFFFF) return bytes;

  const seg = new Uint8Array(4 + payload.length);
  seg[0] = 0xFF;
  seg[1] = 0xE1;
  seg[2] = (segLen >> 8) & 0xFF;
  seg[3] = segLen & 0xFF;
  seg.set(payload, 4);

  // Skip past existing APPn segments (JFIF/ICC blocks canvas emits),
  // bailing out on malformed segment lengths rather than reading past
  // the end of the buffer.
  let pos = 2;
  while (pos + 4 <= bytes.length && bytes[pos] === 0xFF &&
         bytes[pos + 1] >= 0xE0 && bytes[pos + 1] <= 0xEF) {
    const len = (bytes[pos + 2] << 8) | bytes[pos + 3];
    if (len < 2 || pos + 2 + len > bytes.length) return bytes;
    pos += 2 + len;
  }

  const out = new Uint8Array(bytes.length + seg.length);
  out.set(bytes.subarray(0, pos), 0);
  out.set(seg, pos);
  out.set(bytes.subarray(pos), pos + seg.length);
  return out;
}

// CRC32 as used by PNG chunk checksums
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();

export function crc32(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// Insert an iTXt chunk (keyword "Source", UTF-8) right after IHDR.
// Readable with e.g. `exiftool -PNG:Source file.png`.
export function embedSourceInPng(bytes, url) {
  const ihdrEnd = 8 + 4 + 4 + 13 + 4; // signature + IHDR chunk
  if (bytes.length < ihdrEnd) return bytes;

  const enc = new TextEncoder();
  // iTXt layout: keyword \0 compressionFlag compressionMethod lang \0 translatedKeyword \0 text
  const data = enc.encode('Source\u0000\u0000\u0000\u0000\u0000' + url);
  const type = enc.encode('iTXt');

  const chunk = new Uint8Array(4 + 4 + data.length + 4);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, data.length);
  chunk.set(type, 4);
  chunk.set(data, 8);
  const crcInput = new Uint8Array(4 + data.length);
  crcInput.set(type, 0);
  crcInput.set(data, 4);
  dv.setUint32(8 + data.length, crc32(crcInput));

  const out = new Uint8Array(bytes.length + chunk.length);
  out.set(bytes.subarray(0, ihdrEnd), 0);
  out.set(chunk, ihdrEnd);
  out.set(bytes.subarray(ihdrEnd), ihdrEnd + chunk.length);
  return out;
}
