// Snippy offscreen document — extension-owned clipboard write.
//
// This DOM exists only inside the extension's own offscreen page; no web page
// can observe it, read its contents, or intercept the copy event. That's why
// the absolute file path is written here instead of in the content script's
// page-injected DOM (see background.js copyTextViaOffscreen / the
// quick_capture_completed handler).

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action !== 'offscreen_copy') return false;

  try {
    const textarea = document.createElement('textarea');
    textarea.value = message.text;
    // Keep it out of the (invisible, extension-only) viewport flow but still
    // selectable/copyable.
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    sendResponse({ ok });
  } catch (err) {
    console.error('Snippy offscreen copy failed:', err);
    sendResponse({ ok: false });
  }
  return true;
});
