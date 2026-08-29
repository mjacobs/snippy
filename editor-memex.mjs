// Push to Memex: send the annotated screenshot to the user's own Memex
// deployment, where it becomes a capture and gets enriched into a note.
// Request shaping lives in memex-api.mjs; this module is the DOM,
// chrome.storage, and chrome.permissions half of it — the same split the AI
// Lens uses.

import {
  ENDPOINT_ERROR,
  MEMEX_CONFIG_KEYS,
  buildMemexRequest,
  extractMemexError,
  isMemexConfigured,
  normalizeEndpoint,
  originPatternFor,
  originPatternForStored,
  sanitizeStoredEndpoint
} from './memex-api.mjs';

const NOT_CONFIGURED_TITLE =
  'Push to Memex — set the endpoint and device key in the AI Lens panel first';
const CONFIGURED_TITLE = 'Push this screenshot to Memex';
const UNUSABLE_STATUS =
  'Saved Memex URL is no longer usable — re-enter it, or Clear to forget the key.';

export function createMemexPush({
  state,
  showToast,
  commitActiveText,
  buildExportPngBase64,
  withSelectionSuppressed
}) {
  const btnMemex = document.getElementById('btn-memex');
  const endpointInput = document.getElementById('memex-endpoint-input');
  const keyInput = document.getElementById('memex-key-input');
  const btnSave = document.getElementById('btn-memex-save');
  const btnClear = document.getElementById('btn-memex-clear');
  const statusText = document.getElementById('memex-status-text');

  let endpoint = '';
  let deviceKey = '';
  let pushing = false;
  // True whenever chrome.storage.local still holds a Memex key or URL, even an
  // unusable one. Clear stays offered while this is true, so there is always a
  // way to get a stored device key out from inside the panel.
  let anythingStored = false;
  // The origin Snippy may still hold access to. Tracked separately from
  // `endpoint` because a stored endpoint we refuse to push to is still an
  // origin the user granted us, and clearing has to give it back.
  let heldOrigin = '';

  function config() {
    return { endpoint, deviceKey };
  }

  // The editor assigns `state.bgImage` as soon as it makes the Image object,
  // so its presence says nothing about whether pixels have arrived.
  function hasLoadedScreenshot() {
    const img = state.bgImage;
    return Boolean(img && img.complete && img.naturalWidth > 0);
  }

  function syncUi() {
    const ready = isMemexConfigured(config());
    if (btnMemex) {
      btnMemex.disabled = !ready || pushing;
      btnMemex.title = ready ? CONFIGURED_TITLE : NOT_CONFIGURED_TITLE;
      btnMemex.classList.toggle('is-configured', ready);
    }
    if (statusText) {
      if (ready) statusText.textContent = `Connected: ${endpoint}`;
      else if (anythingStored) statusText.textContent = UNUSABLE_STATUS;
      else statusText.textContent = 'Not configured — pushes are disabled.';
    }
    if (btnClear) btnClear.classList.toggle('hidden', !anythingStored);
  }

  async function init() {
    // What the field shows: never the raw stored string, which may carry
    // credentials or a query string an older build kept.
    let shownEndpoint = '';
    try {
      const stored = await chrome.storage.local.get(MEMEX_CONFIG_KEYS);
      const storedEndpoint = (stored && stored.memexEndpoint) || '';
      deviceKey = (stored && stored.memexDeviceKey) || '';
      // Re-read on the way in: a setting stored by an older build may be a raw
      // paste, or a plain-HTTP host we no longer push to. Either way we keep
      // only the sanitized form — pushable as `endpoint`, or just an origin to
      // show and to release the host permission for.
      endpoint = normalizeEndpoint(storedEndpoint);
      anythingStored = Boolean(storedEndpoint || deviceKey);
      heldOrigin = originPatternForStored(storedEndpoint);
      shownEndpoint = endpoint || sanitizeStoredEndpoint(storedEndpoint);
      // Rewrite it in storage too, so the parts we refuse to show stop living
      // on disk rather than only being hidden from this session.
      if (storedEndpoint && shownEndpoint !== storedEndpoint) {
        await chrome.storage.local.set({ memexEndpoint: shownEndpoint });
      }
    } catch (err) {
      console.error('Failed to load Memex config:', err);
    }
    if (endpointInput) endpointInput.value = shownEndpoint;
    if (keyInput) keyInput.value = ''; // never echo the stored secret back
    syncUi();
  }

  // The endpoint is whatever host the user runs Memex on, so the permission
  // to reach it can only be granted at runtime (optional_host_permissions).
  // Both call sites are inside a click, which is what Chrome requires.
  // Reports whether this call is what granted the permission, so a save that
  // then fails can put the host back rather than leaving Snippy holding
  // access to a host it never stored.
  async function ensureHostPermission(forEndpoint) {
    const denied = { ok: false, newlyGranted: false };
    const origins = [originPatternFor(forEndpoint)];
    if (!origins[0]) return denied;
    try {
      if (await chrome.permissions.contains({ origins })) {
        return { ok: true, newlyGranted: false };
      }
      const granted = await chrome.permissions.request({ origins });
      return { ok: Boolean(granted), newlyGranted: Boolean(granted) };
    } catch (err) {
      console.error('Memex host permission request failed:', err);
      return denied;
    }
  }

  // Hand a host back to Chrome once we no longer point at it, so clearing or
  // repointing the setting really does end Snippy's access. Best-effort: the
  // config change stands either way, and the user can always revoke by hand.
  async function dropHostPermission(originPattern, keepPattern = '') {
    if (!originPattern || originPattern === keepPattern) return;
    try {
      await chrome.permissions.remove({ origins: [originPattern] });
    } catch (err) {
      console.error('Releasing the old Memex host permission failed:', err);
    }
  }

  if (btnSave) {
    btnSave.addEventListener('click', async () => {
      // Store the normalized form, never the raw paste: normalization is what
      // strips URL credentials, query strings, and fragments, and the status
      // line shows what we stored.
      const nextEndpoint = normalizeEndpoint(endpointInput ? endpointInput.value : '');
      // An empty key field means "keep the stored one", so the endpoint can be
      // corrected without re-pasting the secret.
      const nextKey = keyInput && keyInput.value.trim() ? keyInput.value.trim() : deviceKey;

      if (!nextEndpoint) {
        showToast(ENDPOINT_ERROR);
        return;
      }
      if (!nextKey) {
        showToast('Enter a Memex device key.');
        return;
      }
      const permission = await ensureHostPermission(nextEndpoint);
      if (!permission.ok) {
        showToast('Snippy needs permission to reach that Memex host.');
        return;
      }
      try {
        await chrome.storage.local.set({
          memexEndpoint: nextEndpoint,
          memexDeviceKey: nextKey
        });
      } catch (err) {
        console.error('Failed to save Memex config:', err);
        showToast('Error saving Memex configuration.');
        // Nothing was stored, so give back a permission this click just asked
        // for — otherwise the very first save leaves Snippy holding a host
        // with no configuration and no Clear button to release it.
        if (permission.newlyGranted) await dropHostPermission(originPatternFor(nextEndpoint));
        return;
      }
      const previousOrigin = heldOrigin;
      heldOrigin = originPatternFor(nextEndpoint);
      endpoint = nextEndpoint;
      deviceKey = nextKey;
      anythingStored = true;
      if (endpointInput) endpointInput.value = nextEndpoint;
      if (keyInput) keyInput.value = '';
      syncUi();
      showToast('Memex configuration saved!');
      await dropHostPermission(previousOrigin, heldOrigin);
    });
  }

  if (btnClear) {
    btnClear.addEventListener('click', async () => {
      // Only claim it is cleared once the stored key is actually gone —
      // otherwise it comes back the next time the editor opens.
      try {
        await chrome.storage.local.remove(MEMEX_CONFIG_KEYS);
      } catch (err) {
        console.error('Failed to clear Memex config:', err);
        showToast('Error clearing Memex configuration.');
        return;
      }
      const previousOrigin = heldOrigin;
      endpoint = '';
      deviceKey = '';
      anythingStored = false;
      heldOrigin = '';
      if (endpointInput) endpointInput.value = '';
      if (keyInput) keyInput.value = '';
      syncUi();
      showToast('Memex configuration cleared.');
      await dropHostPermission(previousOrigin);
    });
  }

  async function pushToMemex() {
    if (pushing) return;
    if (!isMemexConfigured(config())) {
      showToast('Configure Memex in the AI Lens panel first.');
      return;
    }
    // An empty canvas still serializes to valid PNG bytes, so without this the
    // button would happily send a blank capture before the screenshot loads.
    // `bgImage` is truthy from the moment `new Image()` is assigned, well
    // before its src decodes, so having pixels is what has to be checked.
    if (!hasLoadedScreenshot()) {
      showToast('Nothing to push yet — the screenshot is still loading.');
      return;
    }
    if (state.activeTextarea) commitActiveText();

    let imageBase64 = '';
    withSelectionSuppressed(() => {
      try {
        imageBase64 = buildExportPngBase64();
      } catch (err) {
        console.error('PNG export for Memex failed:', err);
      }
    });

    let request;
    try {
      request = buildMemexRequest(config(), {
        imageBase64,
        mime: 'image/png',
        sourceUrl: state.sourceUrl || ''
      });
    } catch (err) {
      showToast(err.message);
      return;
    }

    pushing = true;
    syncUi();
    showToast('Pushing to Memex…');
    try {
      if (!(await ensureHostPermission(endpoint)).ok) {
        showToast('Snippy needs permission to reach that Memex host.');
        return;
      }
      const response = await fetch(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(request.body)
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(extractMemexError(errorData, response.status));
      }
      showToast('Pushed to Memex');
    } catch (err) {
      console.error('Memex push failed:', err);
      showToast(`Memex push failed: ${err.message || 'network error'}`);
    } finally {
      pushing = false;
      syncUi();
    }
  }

  if (btnMemex) btnMemex.addEventListener('click', pushToMemex);

  syncUi();
  init();

  return { pushToMemex };
}
