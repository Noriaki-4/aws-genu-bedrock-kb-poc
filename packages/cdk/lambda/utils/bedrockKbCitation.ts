import { RetrievedReference } from '@aws-sdk/client-bedrock-agent-runtime';
import {
  toOneBasedPageNumber,
  toOriginalPageNumber,
} from '@generative-ai-use-cases/common';

// Split files are ingested from docs/, but the integrated (pre-split) document
// is stored under this prefix so that citations can link back to it. The prefix
// is outside the data source inclusion prefix, so the integrated file is not
// parsed again. Keep in sync with the ingest tool and rag-knowledge-base-stack.
export const INTEGRATED_DOCUMENT_PREFIX = 'originals/';

export const DEFAULT_SNIPPET_MAX_LENGTH = 140;

export type BedrockKbReferenceTarget = {
  url: string;
  // Page inside the ingested file. Kept for reference; for a split document the
  // URL points at the integrated file instead, so this is not used in the link.
  pageNumber?: number;
  // Page of the original document before splitting. Used for the label and, for
  // a split document, for the #page= fragment of the integrated file.
  displayPageNumber?: number;
};

// Label taken from the sidecar metadata. Every part of a split document shares
// the same document_title and original_file_name, so the citations of one
// document collapse into a single label instead of one label per part.
export const resolveBedrockKbDocumentLabel = (
  ref: RetrievedReference
): string | undefined => {
  const metadataTitle =
    (ref?.metadata?.['document_title'] as string | undefined) ||
    (ref?.metadata?.['title'] as string | undefined) ||
    (ref?.metadata?.['x-amz-bedrock-kb-document-title'] as string | undefined);
  if (metadataTitle) return metadataTitle;

  const originalFileName = ref?.metadata?.['original_file_name'] as
    | string
    | undefined;

  return originalFileName
    ? originalFileName.replace(/\.[^.]+$/, '')
    : undefined;
};

// Base URL of the bucket, i.e. the citation URL with the object key removed.
// convertS3UriToUrl builds the URL as `${base}${key}`, so stripping the key
// leaves the bucket root without having to parse the region or bucket name.
const bucketBaseUrl = (
  ref: RetrievedReference,
  url: string
): string | undefined => {
  const s3Uri = ref.location?.s3Location?.uri;
  if (!s3Uri) return undefined;

  const key = s3Uri.replace(/^s3:\/\/[^/]+\//, '');
  return url.endsWith(key) ? url.slice(0, url.length - key.length) : undefined;
};

const withPageFragment = (url: string, page: number | undefined): string =>
  page !== undefined ? `${url}#page=${page}` : url;

export const buildBedrockKbReferenceTarget = (
  ref: RetrievedReference,
  url: string
): BedrockKbReferenceTarget => {
  const isS3Source = Boolean(ref.location?.s3Location?.uri);
  if (!isS3Source) return { url };

  const pageNumber = toOneBasedPageNumber(
    ref.metadata?.['x-amz-bedrock-kb-document-page-number']
  );
  const displayPageNumber = toOriginalPageNumber({
    pageNumber,
    originalPageStart: ref.metadata?.['original_page_start'],
  });

  const originalFileName = ref.metadata?.['original_file_name'] as
    | string
    | undefined;
  const isSplit = ref.metadata?.['original_page_start'] !== undefined;
  const base = bucketBaseUrl(ref, url);

  // A split part links to the integrated document at the original physical page
  // so that the viewer page indicator matches the label. This needs both the
  // original file name and a resolvable bucket base URL.
  if (isSplit && originalFileName && base) {
    return {
      url: withPageFragment(
        `${base}${INTEGRATED_DOCUMENT_PREFIX}${encodeURIComponent(originalFileName)}`,
        displayPageNumber
      ),
      pageNumber,
      displayPageNumber,
    };
  }

  const fileName = url.split('/').pop() || '';
  try {
    const encodedFileName = encodeURIComponent(fileName);
    return {
      url: withPageFragment(url.replace(fileName, encodedFileName), pageNumber),
      pageNumber,
      displayPageNumber,
    };
  } catch {
    return { url, pageNumber, displayPageNumber };
  }
};

// Build a short, single-line excerpt of the retrieved chunk. This gives every
// citation a location hint even when no page number exists (for example DOCX),
// and characters that would break the footnote markdown are removed.
export const buildBedrockKbSnippet = (
  ref: RetrievedReference,
  maxLength: number = DEFAULT_SNIPPET_MAX_LENGTH
): string | undefined => {
  const text = ref.content?.text;
  if (!text) return undefined;

  const normalized = text
    .split('\n')
    .map((line) => line.replace(/^[\s>#*+-]+/, '').replace(/^\d+\.\s*/, ''))
    .join(' ')
    .replace(/[`|[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized === '') return undefined;
  if (normalized.length <= maxLength) return normalized;

  return `${normalized.slice(0, maxLength).trimEnd()}…`;
};

export const formatBedrockKbFootnote = ({
  refId,
  displayTitle,
  target,
  snippet,
}: {
  refId: number;
  displayTitle: string;
  target: BedrockKbReferenceTarget;
  snippet?: string;
}): string => {
  const labelPageNumber = target.displayPageNumber ?? target.pageNumber;
  const pageLabel =
    labelPageNumber !== undefined ? `(${labelPageNumber} page)` : '';
  // A single newline renders as a line break (remark-breaks on the frontend),
  // so the excerpt sits on its own line below the title link.
  const excerpt = snippet ? `\n${snippet}` : '';

  return `\n[^${refId}]: [${displayTitle}${pageLabel}](${target.url})${excerpt}`;
};
