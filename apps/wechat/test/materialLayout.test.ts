import { calculateBarWidths, getTableMinWidth } from '../src/components/materialLayout';

describe('rich material layout helpers', () => {
  test('normalizes chart bars against the largest positive value', () => {
    expect(calculateBarWidths([{ value: 20 }, { value: 50 }, { value: -5 }])).toEqual([40, 100, 0]);
    expect(calculateBarWidths([{ value: 0 }, { value: 0 }])).toEqual([0, 0]);
  });

  test('keeps tables horizontally scrollable with stable column widths', () => {
    expect(getTableMinWidth(2)).toBe(320);
    expect(getTableMinWidth(5)).toBe(600);
  });
});
