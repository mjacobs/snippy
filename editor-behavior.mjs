export function resizeTextareaToContent(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

export function createPersistentOnce(storage, key) {
  let shownInMemory = false;

  return function shouldShow() {
    if (shownInMemory) return false;

    try {
      if (storage.getItem(key)) {
        shownInMemory = true;
        return false;
      }
    } catch (err) {
      // In-memory state below still prevents repeated hints this session.
    }

    shownInMemory = true;
    try {
      storage.setItem(key, '1');
    } catch (err) {
      // Persistence is optional; the in-memory gate is authoritative now.
    }
    return true;
  };
}

export function toolActionForTextHit(activeTool, clickCount, hasTextTarget) {
  if (!hasTextTarget || activeTool === 'select') return 'normal';
  if (activeTool === 'text' || clickCount > 1) return 'suppress';
  return 'track';
}

export function strokeWidthForTool(tool, panelWidth) {
  return tool === 'highlighter' ? panelWidth * 3 : panelWidth;
}

export function isHighlighterContext(activeTool, selectedShape) {
  return activeTool === 'highlighter' ||
    (activeTool === 'select' && selectedShape && selectedShape.type === 'highlighter');
}

globalThis.SnippyEditorBehavior = {
  createPersistentOnce,
  isHighlighterContext,
  resizeTextareaToContent,
  strokeWidthForTool,
  toolActionForTextHit
};
