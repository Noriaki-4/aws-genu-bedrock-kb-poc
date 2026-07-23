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

/**
 * Convert a page number inside a split PDF back to the page number of the
 * original document, using the original_page_start attribute of the sidecar
 * metadata (GENU_RAG_METADATA_DEFINITION.md 6.3).
 *
 * Unsplit documents carry no original_page_start, so the page inside the file
 * already is the page of the original document.
 */
export const toOriginalPageNumber = ({
  pageNumber,
  originalPageStart,
}: {
  pageNumber: number | undefined;
  originalPageStart: unknown;
}): number | undefined => {
  if (pageNumber === undefined) {
    return undefined;
  }

  const normalizedStart =
    typeof originalPageStart === 'number'
      ? originalPageStart
      : typeof originalPageStart === 'string' && originalPageStart.trim() !== ''
        ? Number(originalPageStart)
        : undefined;

  if (
    normalizedStart === undefined ||
    !Number.isSafeInteger(normalizedStart) ||
    normalizedStart < 1 ||
    normalizedStart >= Number.MAX_SAFE_INTEGER
  ) {
    return pageNumber;
  }

  return normalizedStart + pageNumber - 1;
};
