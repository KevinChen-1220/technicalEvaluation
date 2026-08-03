import { getBarFillPercent, getImageAspectRatio } from './questionMaterialLayout';

describe('question material presentation helpers', () => {
  it('uses a widescreen image ratio by default and preserves a supplied ratio', () => {
    expect(getImageAspectRatio()).toBe(16 / 9);
    expect(getImageAspectRatio(1.5)).toBe(1.5);
  });

  it('calculates a clamped bar fill percentage', () => {
    expect(getBarFillPercent(0, 200)).toBe('0%');
    expect(getBarFillPercent(50, 200)).toBe('25%');
    expect(getBarFillPercent(250, 200)).toBe('100%');
    expect(getBarFillPercent(10, 0)).toBe('0%');
  });

  it('rounds fractional bar percentages to two decimal places', () => {
    expect(getBarFillPercent(1, 3)).toBe('33.33%');
  });
});
