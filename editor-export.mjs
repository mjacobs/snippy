// Getting the annotated image out of the editor: copy to the clipboard as
// PNG, download as JPEG, and download-then-copy-the-path for pasting straight
// into a terminal. Source-URL provenance is stamped on the way out.

import {
  bytesToBase64,
  dataUrlToBytes,
  embedSourceInPng,
  embedXmpInJpeg
} from './editor-metadata.mjs';

export function createExport({ canvas, state, drawEverything, showToast, commitActiveText }) {
  const btnCopy = document.getElementById('btn-copy');
  const btnSave = document.getElementById('btn-save');
  const btnSavePath = document.getElementById('btn-save-path');

  // Redraw without selection chrome while fn runs so exports (which snapshot
  // the canvas bitmap synchronously) never include the dashed outline.
  function withSelectionSuppressed(fn) {
    const sel = state.selectedShape;
    if (sel) {
      state.selectedShape = null;
      drawEverything();
    }
    try {
      fn();
    } finally {
      if (sel) {
        state.selectedShape = sel;
        drawEverything();
      }
    }
  }

  // Copy to Clipboard (Modern Async API)
  btnCopy.addEventListener('click', () => {
    if (state.activeTextarea) commitActiveText();

    // toBlob captures the bitmap at call time, so suppressing selection
    // around the synchronous call is sufficient.
    withSelectionSuppressed(() => canvas.toBlob(async (blob) => {
      if (!blob) {
        showToast('Failed to copy. Draw a selection first!');
        return;
      }

      try {
        // Stamp the source page URL as a PNG iTXt chunk; fail open so a
        // metadata problem never blocks the copy itself. The ClipboardItem
        // is constructed synchronously with a Promise payload so the write
        // stays within the click's user-activation window.
        const pngPromise = (async () => {
          if (!state.sourceUrl) return blob;
          try {
            const bytes = new Uint8Array(await blob.arrayBuffer());
            return new Blob([embedSourceInPng(bytes, state.sourceUrl)], { type: 'image/png' });
          } catch (err) {
            console.error('PNG metadata embed failed, copying without it:', err);
            return blob;
          }
        })();
        const item = new ClipboardItem({ 'image/png': pngPromise });
        await navigator.clipboard.write([item]);
        showToast('Annotated image copied to clipboard!');
      } catch (err) {
        console.error('Clipboard write failed:', err);
        showToast('Clipboard copy failed. Try again or check browser permissions.');
      }
    }, 'image/png'));
  });

  // Composite the annotated canvas over a solid white backdrop and return a
  // JPEG data URL. Callers wrap this in withSelectionSuppressed().
  function buildExportJpegUrl() {
    const downloadCanvas = document.createElement('canvas');
    downloadCanvas.width = canvas.width;
    downloadCanvas.height = canvas.height;

    const downloadCtx = downloadCanvas.getContext('2d');

    // Fill pure white backdrop
    downloadCtx.fillStyle = '#ffffff';
    downloadCtx.fillRect(0, 0, downloadCanvas.width, downloadCanvas.height);

    // Composite edited canvas image
    downloadCtx.drawImage(canvas, 0, 0);

    const jpegUrl = downloadCanvas.toDataURL('image/jpeg', 0.95); // High quality compression

    // Stamp the capture's source page URL into the JPEG as XMP metadata.
    // Fail open: a metadata problem must never block the export itself.
    if (state.sourceUrl) {
      try {
        const stamped = embedXmpInJpeg(dataUrlToBytes(jpegUrl), state.sourceUrl);
        return 'data:image/jpeg;base64,' + bytesToBase64(stamped);
      } catch (err) {
        console.error('XMP embed failed, exporting without metadata:', err);
      }
    }
    return jpegUrl;
  }

  // Download JPEG format
  btnSave.addEventListener('click', () => {
    if (state.activeTextarea) commitActiveText();
    if (!canvas.width || !canvas.height) return;
    withSelectionSuppressed(() => {
      try {
        const jpegUrl = buildExportJpegUrl();
        const link = document.createElement('a');
        link.download = `snippy_${Date.now()}.jpg`;
        link.href = jpegUrl;
        link.click();
        showToast('JPEG saved successfully!');
      } catch (err) {
        console.error('JPEG download failed:', err);
        showToast('Failed to export JPEG.');
      }
    });
  });

  // Once the download actually completes (not merely once a filename is
  // known — a download can still be interrupted after that), copy the
  // absolute path to the clipboard. Mirrors waitForDownloadPath in
  // background.js (no build step, so the two contexts can't share code).
  function copyDownloadPathWhenReady(downloadId) {
    let done = false;
    let candidatePath = null;
    const finish = (path) => {
      if (done) return; // onChanged and the initial search can race
      done = true;
      chrome.downloads.onChanged.removeListener(onChanged);
      if (!path) {
        showToast('Saved, but could not determine the file path.');
        return;
      }
      navigator.clipboard.writeText(path)
        .then(() => showToast('JPEG saved — file path copied to clipboard!'))
        .catch((err) => {
          console.error('Path copy failed:', err);
          showToast(`Saved to ${path}, but the clipboard copy failed.`);
        });
    };
    // Cancelled/failed terminal outcome, routed through the same done guard
    // as finish() so onChanged and the initial search can't both settle.
    const failInterrupted = () => {
      if (done) return;
      done = true;
      chrome.downloads.onChanged.removeListener(onChanged);
      showToast('Save was cancelled or failed.');
    };

    const onChanged = (delta) => {
      if (delta.id !== downloadId) return;
      if (delta.filename) {
        candidatePath = delta.filename.current;
        // Not terminal on its own — keep listening for the state change.
      }
      if (!delta.state) return;
      if (delta.state.current === 'interrupted') {
        failInterrupted();
      } else if (delta.state.current === 'complete') {
        chrome.downloads.search({ id: downloadId }, (items) => {
          const item = items && items[0];
          // The fresh search result's filename can come back empty even on
          // a completed download; fall back to the last candidate seen
          // rather than discarding it. Mirrors waitForDownloadPath in
          // background.js (no build step, so the two contexts can't share
          // code).
          finish((item && item.filename) || candidatePath);
        });
      }
    };
    chrome.downloads.onChanged.addListener(onChanged);

    // Initial reconciliation: the download may already be complete or
    // interrupted (both terminal), or already have a candidate filename
    // while still in_progress (keep the listener attached in that case).
    // onChanged may already have settled the operation by the time this
    // callback runs, so it returns immediately if done, and routes every
    // terminal outcome through the same done-guarded finish()/
    // failInterrupted() used above instead of toasting directly — avoids a
    // stale/duplicate toast. Mirrors waitForDownloadPath in background.js.
    chrome.downloads.search({ id: downloadId }, (items) => {
      if (done) return;
      const item = items && items[0];
      if (!item) return;
      if (item.state === 'interrupted') {
        failInterrupted();
        return;
      }
      if (item.state === 'complete') {
        finish((item && item.filename) || candidatePath);
        return;
      }
      if (item.filename) candidatePath = item.filename;
    });
  }

  // Save JPEG AND copy its absolute path — for pasting the file straight
  // into a terminal (e.g. a Claude/Codex chat).
  btnSavePath.addEventListener('click', () => {
    if (state.activeTextarea) commitActiveText();
    if (!canvas.width || !canvas.height) return;

    if (!chrome.downloads) {
      // Permission was added in manifest 1.0.x; an unreloaded extension won't have it yet.
      showToast('Downloads permission unavailable — reload the extension.');
      return;
    }

    let jpegUrl = null;
    withSelectionSuppressed(() => {
      try {
        jpegUrl = buildExportJpegUrl();
      } catch (err) {
        console.error('JPEG export failed:', err);
      }
    });
    if (!jpegUrl) {
      showToast('Failed to export JPEG.');
      return;
    }

    // Save into a dedicated scratch subfolder. saveAs: false skips the
    // picker dialog UNLESS the browser's "Ask where to save each file"
    // setting is on — then Chrome still shows a dialog preselecting
    // snippy.tmp, and a user who redirects the save elsewhere gets a file
    // the cleanup sweep will NOT delete (only the registry entry expires).
    // Chrome only allows downloads inside the Downloads directory and
    // rejects hidden (dot-prefixed) components, so Downloads/snippy.tmp
    // is the closest thing to a /tmp drop zone.
    chrome.downloads.download(
      {
        url: jpegUrl,
        filename: `snippy.tmp/snippy_${Date.now()}.jpg`,
        saveAs: false,
        conflictAction: 'uniquify'
      },
      (downloadId) => {
        if (chrome.runtime && chrome.runtime.lastError) {
          console.error('Download failed:', chrome.runtime.lastError);
          showToast('Failed to save JPEG.');
          return;
        }
        // Register in the shared temp registry so the background sweep can
        // clean this file up after ~24h (same registry as quick snips). The
        // registry lives in the service worker so all mutations serialize
        // through its lock; editor.js must not write it directly.
        chrome.runtime.sendMessage({ action: 'register_tmp_download', downloadId }, () => {
          void chrome.runtime.lastError; // fire-and-forget
        });
        copyDownloadPathWhenReady(downloadId);
      }
    );
  });
}
