// The transient status message at the bottom of the editor, plus the
// one-time hints that use it.

import { createPersistentOnce } from './editor-behavior.mjs';

const TOAST_MS = 3000;

export function createToast(toastEl) {
  const toastMessage = toastEl.querySelector('.toast-message');
  let toastTimeout = null;

  return function showToast(message) {
    if (toastTimeout) {
      clearTimeout(toastTimeout);
    }
    toastMessage.textContent = message;
    toastEl.classList.add('show');

    toastTimeout = setTimeout(() => {
      toastEl.classList.remove('show');
    }, TOAST_MS);
  };
}

// One-time discoverability nudge: the first time a user selects a text
// shape, remind them double-click reopens it for editing. Persisted in
// localStorage (editor-page-local, no cross-context sync needed) so it
// only ever shows once per browser profile.
const TEXT_EDIT_HINT_KEY = 'snippy_textEditHintShown';

export function createTextEditHint(showToast, storage = localStorage) {
  const shouldShowTextEditHint = createPersistentOnce(storage, TEXT_EDIT_HINT_KEY);
  return function maybeShowTextEditHint() {
    if (!shouldShowTextEditHint()) return;
    showToast('Double-click text to edit');
  };
}
