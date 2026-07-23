import {
  buildSplitPlan,
  isSplitPlan,
} from '../../../tools/rag-docs/core/splitPlan';

describe('buildSplitPlan', () => {
  it('splits by the requested page count and keeps the remainder as the last part', () => {
    const plan = buildSplitPlan({ totalPages: 276, pagesPerPart: 50 });

    expect(plan).toHaveLength(6);
    expect(plan[0]).toEqual({ partNumber: 1, startPage: 1, endPage: 50 });
    expect(plan[1]).toEqual({ partNumber: 2, startPage: 51, endPage: 100 });
    expect(plan[5]).toEqual({ partNumber: 6, startPage: 251, endPage: 276 });
  });

  it('produces a single part when the document fits in one part', () => {
    expect(buildSplitPlan({ totalPages: 50, pagesPerPart: 50 })).toEqual([
      { partNumber: 1, startPage: 1, endPage: 50 },
    ]);
    expect(buildSplitPlan({ totalPages: 1, pagesPerPart: 50 })).toEqual([
      { partNumber: 1, startPage: 1, endPage: 1 },
    ]);
  });

  it('uses manual ranges when they are provided', () => {
    const plan = buildSplitPlan({
      totalPages: 120,
      pagesPerPart: 50,
      ranges: [
        { startPage: 1, endPage: 40 },
        { startPage: 41, endPage: 120 },
      ],
    });

    expect(plan).toEqual([
      { partNumber: 1, startPage: 1, endPage: 40 },
      { partNumber: 2, startPage: 41, endPage: 120 },
    ]);
  });

  it.each([
    ['zero total pages', { totalPages: 0, pagesPerPart: 50 }],
    ['zero pages per part', { totalPages: 10, pagesPerPart: 0 }],
    ['non integer pages per part', { totalPages: 10, pagesPerPart: 1.5 }],
  ])('rejects %s', (_label, input) => {
    expect(() => buildSplitPlan(input)).toThrow();
  });

  it.each([
    [
      'a gap between ranges',
      [
        { startPage: 1, endPage: 40 },
        { startPage: 42, endPage: 120 },
      ],
    ],
    [
      'overlapping ranges',
      [
        { startPage: 1, endPage: 40 },
        { startPage: 40, endPage: 120 },
      ],
    ],
    ['a range that does not start at page 1', [{ startPage: 2, endPage: 120 }]],
    [
      'a range that does not reach the last page',
      [{ startPage: 1, endPage: 119 }],
    ],
    ['a range beyond the last page', [{ startPage: 1, endPage: 121 }]],
    ['an inverted range', [{ startPage: 120, endPage: 1 }]],
    ['an empty range list', []],
  ])('rejects %s', (_label, ranges) => {
    expect(() =>
      buildSplitPlan({ totalPages: 120, pagesPerPart: 50, ranges })
    ).toThrow();
  });
});

describe('isSplitPlan', () => {
  it('treats a single part as not split', () => {
    expect(isSplitPlan([{ partNumber: 1, startPage: 1, endPage: 10 }])).toBe(
      false
    );
  });

  it('treats multiple parts as split', () => {
    expect(
      isSplitPlan([
        { partNumber: 1, startPage: 1, endPage: 10 },
        { partNumber: 2, startPage: 11, endPage: 20 },
      ])
    ).toBe(true);
  });
});
