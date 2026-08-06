// Snippy background service worker

function isRestrictedTab(tab) {
  return Boolean(tab && tab.url && (
    tab.url.startsWith('chrome://') ||
    tab.url.startsWith('chrome-extension://') ||
    tab.url.startsWith('https://chrome.google.com/webstore') ||
    tab.url.startsWith('view-source:')
  ));
}

// Shared with the 'capture_completed' message handler below: stash the image
// (plus the page it came from, for export metadata) and open the editor tab.
async function storeScreenshotAndOpenEditor(dataUrl, sourceUrl) {
  await chrome.storage.local.set({
    activeScreenshot: dataUrl,
    screenshotTimestamp: Date.now(),
    sourceUrl: sourceUrl || ''
  });
  await chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
}

// Full Capture command: grabs the whole visible tab and sends it straight to
// the editor, bypassing the drag-select overlay entirely — captureVisibleTab
// already returns the full viewport, so no cropping step is needed.
async function startFullCapture(tab) {
  if (!tab || !tab.id) return;

  if (isRestrictedTab(tab)) {
    console.warn("Snippy cannot be run on Chrome internal or store pages.");
    return;
  }

  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    await storeScreenshotAndOpenEditor(dataUrl, tab.url || '');
  } catch (err) {
    console.error('Snippy full capture failed:', err);
  }
}

async function startCapture(tab, mode) {
  if (!tab || !tab.id) return;

  // Guard against restricted pages
  if (isRestrictedTab(tab)) {
    console.warn("Snippy cannot be run on Chrome internal or store pages.");
    return;
  }

  try {
    // 1. Capture the visible area of the active tab
    const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });

    // 2. Check if the content script is already injected
    let injected = false;
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
      if (response && response.status === 'pong') {
        injected = true;
      }
    } catch (e) {
      // Message failed, content script is not injected yet
    }

    // 3. Inject if not already present
    if (!injected) {
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ['content.css']
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
    }

    // 4. Send message to start the selection overlay
    await chrome.tabs.sendMessage(tab.id, {
      action: 'start_selection',
      dataUrl: dataUrl,
      mode: mode
    });

  } catch (err) {
    console.error('Snippy background capture failed:', err);
  }
}

// Copy text to the clipboard via an extension-owned offscreen document,
// rather than through the page's content script. The offscreen DOM cannot be
// observed or interfered with by page scripts, so this is used specifically
// so that an absolute filesystem path never has to be sent to, or rendered
// in, the page (see quick_capture_completed below).
async function copyTextViaOffscreen(text) {
  try {
    const existingContexts = await chrome.runtime.getContexts({
      contextTypes: ['OFFSCREEN_DOCUMENT']
    });
    if (!existingContexts || existingContexts.length === 0) {
      try {
        await chrome.offscreen.createDocument({
          url: 'offscreen.html',
          reasons: ['CLIPBOARD'],
          justification: 'Copy the saved screenshot path to the clipboard'
        });
      } catch (err) {
        // Another concurrent call may have created it between our check and
        // this call; only treat a genuine failure as fatal.
        if (!String(err && err.message).includes('single offscreen')) {
          throw err;
        }
      }
    }
    const response = await chrome.runtime.sendMessage({ action: 'offscreen_copy', text });
    return Boolean(response && response.ok);
  } catch (err) {
    console.warn('Snippy: offscreen clipboard copy failed:', err);
    return false;
  }
}

// Ask the native-messaging host (native/snippy_host.py) to save the JPEG to
// the per-user temp dir and return its path. Never rejects; resolves to:
//   { path }          host saved the file
//   { fallback: true }  host missing/failed cleanly — downloads flow is safe
//   { timeout: true }   host started but didn't answer in time — AMBIGUOUS:
//                       it may still write the file, so the caller must NOT
//                       run the downloads fallback (duplicate files, and the
//                       chooser this helper exists to avoid).
const NATIVE_HOST_TIMEOUT_MS = 3000;

function saveTempViaNativeHost(dataUrl) {
  const base64 = typeof dataUrl === 'string' ? dataUrl.split(',')[1] : undefined;
  if (!base64) return Promise.resolve({ fallback: true });

  return new Promise((resolve) => {
    // connectNative (not sendNativeMessage) so the port — and with it the
    // host process — is explicitly torn down on every exit path. A wedged
    // host is killed at the timeout instead of lingering, which also keeps
    // repeated timeouts from accumulating host processes. The settled guard
    // ignores late events after the first terminal one.
    let settled = false;
    let port = null;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (port) {
        try { port.disconnect(); } catch (e) { /* already gone */ }
      }
      resolve(result);
    };
    const timer = setTimeout(() => finish({ timeout: true }), NATIVE_HOST_TIMEOUT_MS);
    try {
      port = chrome.runtime.connectNative('io.kenn.snippy');
      port.onMessage.addListener((response) => {
        if (!response || !response.ok) {
          finish({ fallback: true });
        } else {
          finish({ path: response.path });
        }
      });
      port.onDisconnect.addListener(() => {
        // Only a host that provably never started (not installed / access
        // denied) is safe to fall back from. A host that started and died
        // without replying may already have written the file — treat that
        // like a timeout and fail rather than risk a duplicate save.
        const msg = (chrome.runtime.lastError && chrome.runtime.lastError.message) || '';
        if (/not found|forbidden|failed to start/i.test(msg)) {
          finish({ fallback: true });
        } else {
          finish({ timeout: true });
        }
      });
      port.postMessage({ action: 'save_temp', data: base64 });
    } catch (err) {
      finish({ fallback: true });
    }
  });
}

chrome.action.onClicked.addListener((tab) => startCapture(tab, 'edit'));

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'quick_snip') startCapture(tab, 'quick');
  if (command === 'full_capture') startFullCapture(tab);
});

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'capture_completed') {
    (async () => {
      try {
        // Store the cropped image, along with the page it came from so the
        // editor can embed it as image metadata on export, then open the
        // editor in a new tab.
        await storeScreenshotAndOpenEditor(message.dataUrl, sender.tab && sender.tab.url);

        sendResponse({ status: 'success' });
      } catch (err) {
        console.error('Failed to store screenshot or open editor:', err);
        sendResponse({ status: 'error', error: err.message });
      }
    })();
    return true; // Keep message channel open for async response
  }

  if (message.action === 'register_tmp_download') {
    registerTmpDownload(message.downloadId)
      .then(() => sendResponse({ status: 'ok' }))
      .catch((err) => {
        console.warn('Snippy temp registration failed:', err);
        sendResponse({ status: 'error' });
      });
    return true; // Keep message channel open for async response
  }

  if (message.action === 'quick_capture_completed') {
    (async () => {
      try {
        // Native-first: Chrome's "Ask where to save each file before
        // downloading" preference forces a save-file dialog even for
        // chrome.downloads.download({ saveAs: false }), so the downloads
        // API can't save silently on a profile with that setting on. A
        // native messaging host (native/snippy_host.py) writes the JPEG to
        // /tmp/snippy/ directly and hands back the path, bypassing the
        // downloads API — and its save dialog — entirely. If the host
        // isn't installed or errors, fall through to the downloads flow
        // below unchanged.
        const native = await saveTempViaNativeHost(message.dataUrl);
        if (native.path) {
          const copied = await copyTextViaOffscreen(native.path);
          sendResponse({ status: 'ok', copied });
          // Still sweep old Downloads/snippy.tmp entries (from Save+Path or
          // pre-helper snips) so "cleaned at the next quick snip" holds
          // regardless of which save path this snip took.
          cleanupOldTmpDownloads().catch((err) => console.warn('Snippy temp cleanup failed:', err));
          return;
        }
        if (native.timeout) {
          // Ambiguous: the host may still commit the file after the timeout.
          // Fail the snip rather than double-save via the downloads flow.
          sendResponse({ status: 'error' });
          return;
        }

        const downloadId = await new Promise((resolve, reject) => {
          chrome.downloads.download(
            {
              url: message.dataUrl,
              filename: `snippy.tmp/snippy_${Date.now()}.jpg`,
              saveAs: false,
              conflictAction: 'uniquify'
            },
            (id) => {
              if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
              } else {
                resolve(id);
              }
            }
          );
        });
        const path = await waitForDownloadPath(downloadId);
        if (path) {
          await registerTmpDownload(downloadId);
          // The absolute path stays in the background/offscreen contexts —
          // it is never sent to the content script or rendered in the page.
          const copied = await copyTextViaOffscreen(path);
          sendResponse({ status: 'ok', copied });
          cleanupOldTmpDownloads().catch((err) => console.warn('Snippy temp cleanup failed:', err));
        } else {
          sendResponse({ status: 'error' });
        }
      } catch (err) {
        console.error('Quick snip save failed:', err);
        sendResponse({ status: 'error' });
      }
    })();
    return true; // Keep message channel open for async response
  }
});

// snippyTmpDownloads (chrome.storage.local) is mutated via read-modify-write
// from registerTmpDownload and the cleanup sweep, both of which can run
// concurrently in this service worker. Serialize all mutations through a
// single promise-chain mutex so they can't clobber each other.
let registryLock = Promise.resolve();
function withRegistryLock(fn) {
  const run = registryLock.then(fn, fn);
  registryLock = run.then(() => {}, () => {});
  return run;
}

// Registry of Snippy's own temp downloads (quick snips and the editor's
// Save + Path saves). Cleanup (Task 3) deletes ONLY registered IDs — a
// filename-pattern sweep could match unrelated user downloads. editor.js
// cannot write this registry directly; it must go through the
// 'register_tmp_download' message so every mutation is serialized here.
function registerTmpDownload(downloadId) {
  if (!Number.isInteger(downloadId) || downloadId < 0) {
    console.warn('Snippy: refusing to register invalid download id:', downloadId);
    return Promise.resolve();
  }
  return withRegistryLock(async () => {
    const data = await chrome.storage.local.get({ snippyTmpDownloads: [] });
    const list = data.snippyTmpDownloads;
    list.push({ id: downloadId, startedAt: Date.now() });
    await chrome.storage.local.set({ snippyTmpDownloads: list });
  });
}

// Resolve a download's final absolute path. The filename is often known
// before the download finishes (immediately for a default download dir), but
// that's only a candidate — the download can still be interrupted after a
// filename is assigned. Success resolves only once state reaches 'complete';
// an 'interrupted' state resolves null. Mirrors copyDownloadPathWhenReady in
// editor.js (no build step, so the two contexts can't share code).
function waitForDownloadPath(downloadId) {
  return new Promise((resolve) => {
    let done = false;
    let candidatePath = null;
    const finish = (path) => {
      if (done) return;
      done = true;
      chrome.downloads.onChanged.removeListener(onChanged);
      resolve(path || null);
    };
    const onChanged = (delta) => {
      if (delta.id !== downloadId) return;
      if (delta.filename) {
        candidatePath = delta.filename.current;
        // Not terminal on its own — keep listening for the state change.
      }
      if (!delta.state) return;
      if (delta.state.current === 'interrupted') {
        finish(null);
      } else if (delta.state.current === 'complete') {
        chrome.downloads.search({ id: downloadId }, (items) => {
          const item = items && items[0];
          // The fresh search result's filename can come back empty even on
          // a completed download; fall back to the last candidate seen
          // rather than discarding it. If the search returns nothing at
          // all, still settle rather than staying pending forever.
          finish((item && item.filename) || candidatePath);
        });
      }
    };
    chrome.downloads.onChanged.addListener(onChanged);
    // Initial reconciliation: the download may already be complete or
    // interrupted (both terminal), or already have a candidate filename
    // while still in_progress (keep the listener attached in that case).
    chrome.downloads.search({ id: downloadId }, (items) => {
      const item = items && items[0];
      if (!item) return;
      if (item.state === 'interrupted') {
        finish(null);
        return;
      }
      if (item.state === 'complete') {
        finish((item && item.filename) || candidatePath);
        return;
      }
      if (item.filename) candidatePath = item.filename;
    });
  });
}

// Snippy's temp exports are throwaway; opportunistically sweep registered
// entries older than 24h (on startup and after each quick snip — not a
// guaranteed TTL). Only IDs Snippy itself registered are ever touched, and
// only while their file still resolves under a snippy.tmp directory.
const TMP_DOWNLOAD_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function cleanupOldTmpDownloads() {
  return withRegistryLock(async () => {
    const data = await chrome.storage.local.get({ snippyTmpDownloads: [] });
    const keep = [];
    for (const entry of data.snippyTmpDownloads) {
      if (!Number.isInteger(entry.id) || entry.id < 0 || !Number.isFinite(entry.startedAt)) {
        // Invalid persisted entry: drop it from the registry, touch nothing.
        console.warn('Snippy: dropping invalid tmp download registry entry:', entry);
        continue;
      }
      if (Date.now() - entry.startedAt < TMP_DOWNLOAD_MAX_AGE_MS) {
        keep.push(entry);
        continue;
      }
      // Expired: check the download's current state before deciding.
      const items = await chrome.downloads.search({ id: entry.id });
      const item = items && items[0];
      if (!item || !item.filename || !/[/\\]snippy\.tmp[/\\]/.test(item.filename)) {
        // Unknown or renamed: drop the entry untouched, nothing to clean up.
        continue;
      }
      if (item.exists === false) {
        // File is already gone; just erase the history entry and drop it.
        await new Promise((resolve) => chrome.downloads.erase({ id: entry.id }, resolve));
        continue;
      }
      // File still exists: attempt deletion. On failure, keep the entry so
      // the next sweep retries rather than silently orphaning the file.
      const removed = await new Promise((resolve) => {
        chrome.downloads.removeFile(entry.id, () => {
          if (chrome.runtime.lastError) {
            resolve(false);
          } else {
            resolve(true);
          }
        });
      });
      if (!removed) {
        keep.push(entry);
        continue;
      }
      await new Promise((resolve) => chrome.downloads.erase({ id: entry.id }, resolve));
    }
    await chrome.storage.local.set({ snippyTmpDownloads: keep });
  });
}

chrome.runtime.onStartup.addListener(() => {
  cleanupOldTmpDownloads().catch((err) => console.warn('Snippy temp cleanup failed:', err));
});
