// Numbered markers keep their labels when moved or deleted. Deriving the next
// label from the document also makes undo, redo and clear restore the sequence.
import { normalizeHex } from './editor-state.mjs';

export const NUMBER_FONT_SIZE = 18;

export function createNumberMarker(shapes, x, y, color = '#ff3b30') {
  let highest = 0;
  for (const shape of shapes) {
    if (shape.type === 'number') highest = Math.max(highest, shape.number);
  }
  return { type: 'number', number: highest + 1, x1: x, y1: y, color };
}

export function numberMarkerRadius(shape) {
  // Leave room for multiple digits without squeezing the label or making
  // the circle oval. Used for both rendering and selection geometry.
  return Math.max(16, String(shape.number).length * 6 + 5);
}

export function numberLabelColor(color) {
  const hex = normalizeHex(color).slice(1);
  const channels = [0, 2, 4].map(i => {
    const value = parseInt(hex.slice(i, i + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.179 ? '#000000' : '#ffffff';
}
