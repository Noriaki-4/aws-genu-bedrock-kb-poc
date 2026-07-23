import {
  toOneBasedPageNumber,
  toOriginalPageNumber,
} from '@generative-ai-use-cases/common';

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

describe('toOriginalPageNumber', () => {
  test.each([
    [1, 51, 51],
    [23, 51, 73],
    [50, 51, 100],
    [1, 1, 1],
    [3, '101', 103],
  ])(
    'maps page %p of a part starting at %p to original page %p',
    (pageNumber, originalPageStart, expected) => {
      expect(toOriginalPageNumber({ pageNumber, originalPageStart })).toBe(
        expected
      );
    }
  );

  test.each([
    undefined,
    null,
    '',
    ' ',
    'not-a-number',
    true,
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER,
  ])(
    'falls back to the page inside the file when original_page_start is %p',
    (originalPageStart) => {
      expect(toOriginalPageNumber({ pageNumber: 7, originalPageStart })).toBe(
        7
      );
    }
  );

  test('returns undefined when the page inside the file is unknown', () => {
    expect(
      toOriginalPageNumber({ pageNumber: undefined, originalPageStart: 51 })
    ).toBeUndefined();
  });
});
