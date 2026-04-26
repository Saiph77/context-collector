export interface CursorPoint {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function calculateCenteredBounds(cursor: CursorPoint, workArea: Rect, width: number, height: number): Rect {
  const targetX = Math.round(cursor.x - width / 2);
  const targetY = Math.round(cursor.y - height / 2);

  const minX = workArea.x;
  const minY = workArea.y;
  const maxX = workArea.x + workArea.width - width;
  const maxY = workArea.y + workArea.height - height;

  const x = clamp(targetX, minX, Math.max(minX, maxX));
  const y = clamp(targetY, minY, Math.max(minY, maxY));

  return { x, y, width, height };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
