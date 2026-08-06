export function effectiveTextBoxWidth(shape, measuredInkWidth) {
  return Number.isFinite(shape.width) && shape.width > 0
    ? shape.width
    : measuredInkWidth;
}

export function resizedTextBoxWidth(shape, pointerX) {
  return Math.max(shape.fontSize * 2, pointerX - shape.x1);
}

export function textBoxResizeHandle(shape, layout) {
  return {
    id: 'text-e',
    x: shape.x1 + layout.boxWidth,
    y: shape.y1 + layout.height / 2,
    cursor: 'ew-resize'
  };
}

globalThis.SnippyEditorGeometry = {
  effectiveTextBoxWidth,
  resizedTextBoxWidth,
  textBoxResizeHandle
};
