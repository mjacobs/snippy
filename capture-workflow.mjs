const CAPTURE_KEY_PREFIX = 'snippyCapture:';
const CAPTURE_MAX_AGE_MS = 5 * 60 * 1000;
const LEGACY_CAPTURE_KEYS = ['activeScreenshot', 'screenshotTimestamp', 'sourceUrl'];

export function captureStorageKey(captureId) {
  return `${CAPTURE_KEY_PREFIX}${captureId}`;
}

async function pruneCaptureStorage(storage, now) {
  // These keys were a shared screenshot cache, not user data. New editors
  // consume namespaced records, so remove the obsolete cache in one direction.
  await storage.remove(LEGACY_CAPTURE_KEYS);

  const stored = await storage.get(null);
  const expired = Object.entries(stored || {})
    .filter(([key, record]) => (
      key.startsWith(CAPTURE_KEY_PREFIX) &&
      (!record || !Number.isFinite(record.capturedAt) ||
       now - record.capturedAt > CAPTURE_MAX_AGE_MS)
    ))
    .map(([key]) => key);
  if (expired.length) await storage.remove(expired);
}

export async function storeCaptureAndOpenEditor(dependencies, dataUrl, sourceUrl) {
  const capturedAt = dependencies.now();
  await pruneCaptureStorage(dependencies.storage, capturedAt);
  const captureId = dependencies.randomUUID();
  const key = captureStorageKey(captureId);
  const record = {
    dataUrl,
    sourceUrl: sourceUrl || '',
    capturedAt
  };

  await dependencies.storage.set({ [key]: record });
  try {
    const editorUrl = dependencies.getUrl('editor.html');
    await dependencies.tabs.create({
      url: `${editorUrl}?capture=${encodeURIComponent(captureId)}`
    });
  } catch (err) {
    await dependencies.storage.remove(key);
    throw err;
  }

  return captureId;
}

export async function consumeCapture(storage, search) {
  const captureId = new URLSearchParams(search).get('capture');
  if (!captureId) return null;

  const key = captureStorageKey(captureId);
  const stored = await storage.get(key);
  const record = stored && stored[key];
  if (!record) return null;

  await storage.remove(key);
  return record;
}
