import { getLoadingDotDelay, shouldDimButton } from './loadingAnimation';

test('returns staggered delays for the three loading dots', () => {
  expect([0, 1, 2].map((index) => getLoadingDotDelay(index as 0 | 1 | 2))).toEqual([0, 140, 280]);
});

test('dims a disabled button when it is not loading', () => {
  expect(shouldDimButton(true, false)).toBe(true);
});

test('keeps a disabled loading button at full opacity', () => {
  expect(shouldDimButton(true, true)).toBe(false);
});
