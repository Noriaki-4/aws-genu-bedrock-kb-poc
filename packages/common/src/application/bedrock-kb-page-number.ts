/**
 * Convert the zero-based page index returned in
 * x-amz-bedrock-kb-document-page-number to a one-based page number for
 * display and PDF URL fragments.
 */
export const toOneBasedPageNumber = (
  pageIndex: unknown
): number | undefined => {
  const normalizedPageIndex =
    typeof pageIndex === 'number'
      ? pageIndex
      : typeof pageIndex === 'string' && pageIndex.trim() !== ''
        ? Number(pageIndex)
        : undefined;

  if (
    normalizedPageIndex === undefined ||
    !Number.isSafeInteger(normalizedPageIndex) ||
    normalizedPageIndex < 0 ||
    normalizedPageIndex >= Number.MAX_SAFE_INTEGER
  ) {
    return undefined;
  }

  return normalizedPageIndex + 1;
};
