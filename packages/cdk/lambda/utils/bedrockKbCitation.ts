import { RetrievedReference } from '@aws-sdk/client-bedrock-agent-runtime';
import { toOneBasedPageNumber } from '@generative-ai-use-cases/common';

export type BedrockKbReferenceTarget = {
  url: string;
  pageNumber?: number;
};

export const buildBedrockKbReferenceTarget = (
  ref: RetrievedReference,
  url: string
): BedrockKbReferenceTarget => {
  const isS3Source = Boolean(ref.location?.s3Location?.uri);
  if (!isS3Source) return { url };

  const pageNumber = toOneBasedPageNumber(
    ref.metadata?.['x-amz-bedrock-kb-document-page-number']
  );
  const fileName = url.split('/').pop() || '';

  try {
    const encodedFileName = encodeURIComponent(fileName);
    return {
      url: `${url.replace(fileName, encodedFileName)}${pageNumber !== undefined ? `#page=${pageNumber}` : ''}`,
      pageNumber,
    };
  } catch {
    return { url, pageNumber };
  }
};

export const formatBedrockKbFootnote = ({
  refId,
  displayTitle,
  target,
}: {
  refId: number;
  displayTitle: string;
  target: BedrockKbReferenceTarget;
}): string =>
  `\n[^${refId}]: [${displayTitle}${target.pageNumber !== undefined ? `(${target.pageNumber} page)` : ''}](${target.url})`;
