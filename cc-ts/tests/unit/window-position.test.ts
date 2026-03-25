import { describe, expect, it } from 'vitest';

import { calculateCenteredBounds } from '../../src/main/position';

describe('window positioning', () => {
  it('centers window around cursor when enough space exists', () => {
    const result = calculateCenteredBounds({ x: 500, y: 500 }, { x: 0, y: 0, width: 2000, height: 1200 }, 860, 520);

    expect(result.x).toBe(70);
    expect(result.y).toBe(240);
    expect(result.width).toBe(860);
    expect(result.height).toBe(520);
  });

  it('clamps position to stay inside work area', () => {
    const result = calculateCenteredBounds({ x: 10, y: 8 }, { x: 0, y: 0, width: 900, height: 540 }, 860, 520);

    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
  });

  it('keeps window inside non-zero-origin display work area', () => {
    const result = calculateCenteredBounds(
      { x: 3400, y: 100 },
      { x: 3000, y: 0, width: 1200, height: 900 },
      860,
      520,
    );

    expect(result.x).toBe(3000);
    expect(result.y).toBe(0);
    expect(result.x + result.width).toBe(3860);
    expect(result.y + result.height).toBe(520);
  });
});
