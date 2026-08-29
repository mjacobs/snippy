// Push-to-Memex request shaping: endpoint normalization, config validation,
// and the POST body for /api/v1/capture/image.
// Pure: no DOM, no fetch, no chrome.* — the caller performs the request.

export const MEMEX_CONFIG_KEYS = ['memexEndpoint', 'memexDeviceKey'];

export const MEMEX_CAPTURE_PATH = '/api/v1/capture/image';

// Shown verbatim to the user, so it has to say what to type instead.
export const ENDPOINT_ERROR =
  'Memex URL must start with https:// (http:// only for localhost or 127.0.0.1).';

// Every push carries the device key in an Authorization header, so cleartext
// HTTP is only ever acceptable to a loopback address — nothing on the wire.
// Chrome match patterns cannot express an IPv6 literal host, so an `[::1]`
// endpoint could never be granted the optional host permission it needs; use
// 127.0.0.1 for a local Memex.
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1']);

export function isLoopbackHost(hostname) {
  return LOOPBACK_HOSTS.has(String(hostname || '').toLowerCase());
}

// Accept whatever the user pasted — with or without a trailing slash, with or
// without the /api/v1 suffix — and return the bare service origin+path the
// capture path is appended to. Empty string if it isn't a usable URL: https
// anywhere, or http to loopback only.
export function normalizeEndpoint(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    // `https://*` parses, and its origin makes the match pattern `https://*/*`
    // — a grant over every https site rather than the one host the user meant.
    // A real hostname never contains one, so refuse the URL outright.
    if (u.hostname.includes('*')) return '';
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && isLoopbackHost(u.hostname))) {
      return '';
    }
    u.username = '';
    u.password = '';
    u.hash = '';
    u.search = '';
    u.pathname = u.pathname.replace(/\/+$/, '').replace(/\/api\/v1$/, '');
    return u.toString().replace(/\/$/, '');
  } catch (err) {
    return '';
  }
}

export function isMemexConfigured(config) {
  if (!config) return false;
  return Boolean(normalizeEndpoint(config.endpoint) && String(config.deviceKey || '').trim());
}

// The host permission pattern the extension needs before it may fetch the
// user's own Memex deployment (MV3 grants these at runtime).
//
// A Chrome match pattern is scheme + host + path and cannot carry a port, so
// `http://localhost:8780/*` is rejected outright and the save fails. The
// pattern therefore drops the port while the endpoint we fetch keeps it.
// Chrome has no per-port granularity here: a grant covers every port on that
// host under that scheme.
function matchPatternForUrl(u) {
  return `${u.protocol}//${u.hostname}/*`;
}

export function originPatternFor(endpoint) {
  const normalized = normalizeEndpoint(endpoint);
  if (!normalized) return '';
  return matchPatternForUrl(new URL(normalized));
}

// The bare origin of an endpoint we would no longer accept — a plain-HTTP host
// stored by an older build. It deliberately skips the https rule, because a
// host we may still hold access to has to be releasable and displayable
// whether or not we would push to it today. Dropping everything but the origin
// is what keeps any embedded credentials or query string out of storage and
// off the screen.
export function sanitizeStoredEndpoint(raw) {
  try {
    const u = new URL(String(raw || '').trim());
    if (u.hostname.includes('*')) return '';
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.origin;
  } catch (err) {
    return '';
  }
}

// The match pattern for that origin, used only to hand a permission back. Same
// port rule as originPatternFor: the pattern names the host, not the port.
export function originPatternForStored(raw) {
  const origin = sanitizeStoredEndpoint(raw);
  return origin ? matchPatternForUrl(new URL(origin)) : '';
}

// {url, headers, body} for one screenshot push. Throws on a config the user
// still has to fix, so the caller can toast the message verbatim.
export function buildMemexRequest(config, capture) {
  const endpoint = normalizeEndpoint(config && config.endpoint);
  if (!endpoint) throw new Error(ENDPOINT_ERROR);

  const deviceKey = String((config && config.deviceKey) || '').trim();
  if (!deviceKey) throw new Error('Memex device key is missing.');

  const imageBase64 = (capture && capture.imageBase64) || '';
  if (!imageBase64) throw new Error('Nothing to push — the canvas is empty.');

  const body = {
    image_base64: imageBase64,
    mime: (capture && capture.mime) || 'image/png',
    source: 'web'
  };
  if (capture.text) body.text = capture.text;
  if (capture.sourceUrl) body.source_url = capture.sourceUrl;
  if (capture.title) body.title = capture.title;

  return {
    url: endpoint + MEMEX_CAPTURE_PATH,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${deviceKey}`
    },
    body
  };
}

// Memex answers errors as {"error": {"code", "message"}}; fall back to status.
export function extractMemexError(errorData, status) {
  const message = errorData && errorData.error && errorData.error.message;
  if (status === 401) return 'Memex rejected the device key.';
  return message || `HTTP Error ${status}`;
}
