import { PartRange } from './types';

export interface PageRangeInput {
  readonly startPage: number;
  readonly endPage: number;
}

export interface SplitPlanInput {
  readonly totalPages: number;
  readonly pagesPerPart: number;
  readonly ranges?: readonly PageRangeInput[];
}

const assertPositiveInteger = (value: number, label: string): void => {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(
      `${label} must be a positive integer, but received ${value}`
    );
  }
};

// Manual ranges must cover every page exactly once so that no page is silently
// dropped from the knowledge base.
const toPlanFromRanges = (
  ranges: readonly PageRangeInput[],
  totalPages: number
): PartRange[] => {
  if (ranges.length === 0) {
    throw new Error('ranges must contain at least one page range');
  }

  let expectedStartPage = 1;

  const plan = ranges.map((range, index) => {
    assertPositiveInteger(range.startPage, `ranges[${index}].startPage`);
    assertPositiveInteger(range.endPage, `ranges[${index}].endPage`);

    if (range.endPage < range.startPage) {
      throw new Error(
        `ranges[${index}] must not end before it starts (${range.startPage}-${range.endPage})`
      );
    }
    if (range.startPage !== expectedStartPage) {
      throw new Error(
        `ranges[${index}] must start at page ${expectedStartPage}, but starts at ${range.startPage}`
      );
    }
    if (range.endPage > totalPages) {
      throw new Error(
        `ranges[${index}] ends at page ${range.endPage}, but the document has ${totalPages} pages`
      );
    }

    expectedStartPage = range.endPage + 1;

    return {
      partNumber: index + 1,
      startPage: range.startPage,
      endPage: range.endPage,
    };
  });

  if (expectedStartPage !== totalPages + 1) {
    throw new Error(
      `ranges must cover all ${totalPages} pages, but stop at page ${expectedStartPage - 1}`
    );
  }

  return plan;
};

const toPlanFromPageCount = (
  totalPages: number,
  pagesPerPart: number
): PartRange[] => {
  const plan: PartRange[] = [];

  for (
    let startPage = 1, partNumber = 1;
    startPage <= totalPages;
    startPage += pagesPerPart, partNumber += 1
  ) {
    plan.push({
      partNumber,
      startPage,
      endPage: Math.min(startPage + pagesPerPart - 1, totalPages),
    });
  }

  return plan;
};

// Build the page ranges of every split file. Pages are one-based and inclusive.
export const buildSplitPlan = ({
  totalPages,
  pagesPerPart,
  ranges,
}: SplitPlanInput): PartRange[] => {
  assertPositiveInteger(totalPages, 'totalPages');
  assertPositiveInteger(pagesPerPart, 'pagesPerPart');

  return ranges
    ? toPlanFromRanges(ranges, totalPages)
    : toPlanFromPageCount(totalPages, pagesPerPart);
};

// A plan with a single part is an unsplit document, so the part metadata must
// be omitted (GENU_RAG_METADATA_DEFINITION.md 6.1).
export const isSplitPlan = (plan: readonly PartRange[]): boolean =>
  plan.length > 1;
