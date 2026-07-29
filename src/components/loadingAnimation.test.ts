import { getLoadingDotDelay } from './loadingAnimation';

test('returns staggered delays for the three loading dots', () => {
  expect([0, 1, 2].map((index) => getLoadingDotDelay(index as 0 | 1 | 2))).toEqual([0, 140, 280]);
});
