import { toOneBasedPageNumber } from '@generative-ai-use-cases/common';

describe('toOneBasedPageNumber', () => {
  test.each([
    [0, 1],
    [1, 2],
    [2, 3],
    ['0', 1],
    ['2.0', 3],
    [' 4 ', 5],
  ])('converts zero-based page index %p to %p', (pageIndex, expected) => {
    expect(toOneBasedPageNumber(pageIndex)).toBe(expected);
  });

  test.each([
    undefined,
    null,
    '',
    ' ',
    'not-a-number',
    true,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER,
  ])('returns undefined for invalid page index %p', (pageIndex) => {
    expect(toOneBasedPageNumber(pageIndex)).toBeUndefined();
  });
});
