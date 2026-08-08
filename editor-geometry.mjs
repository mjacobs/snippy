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

export function wrapTextToWidth(text, maxWidth, measureText) {
  const tokens = text.match(/ +|[^ ]+/g) || [''];
  const lines = [];
  let current = '';
  let hasWord = false;

  for (const token of tokens) {
    if (/^ +$/.test(token)) {
      current += token;
      continue;
    }

    const candidate = current + token;
    if (!hasWord || measureText(candidate).width <= maxWidth) {
      current = candidate;
      hasWord = true;
    } else {
      lines.push(current.replace(/ +$/, ''));
      current = token;
      hasWord = true;
    }
  }
  lines.push(current);
  return lines;
}
