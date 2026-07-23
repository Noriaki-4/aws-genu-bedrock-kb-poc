import { sidecarFileNameFor } from './sidecar';
import {
  DocumentMetadata,
  PartArtifact,
  PartRange,
  PartsManifestFile,
} from './types';

const MIN_PAGE_DIGITS = 4;

const pageDigitsOf = (totalPages: number): number =>
  Math.max(MIN_PAGE_DIGITS, String(totalPages).length);

// File names stay diagnosable on S3. The name shown to users comes from
// document_title in the sidecar, not from the file name.
export const partFileName = ({
  baseName,
  extension,
  part,
  totalPages,
  split,
}: {
  baseName: string;
  extension: string;
  part: PartRange;
  totalPages: number;
  split: boolean;
}): string => {
  if (!split) return `${baseName}.${extension}`;

  const digits = pageDigitsOf(totalPages);
  const start = String(part.startPage).padStart(digits, '0');
  const end = String(part.endPage).padStart(digits, '0');

  return `${baseName}_p${start}-${end}.${extension}`;
};

export interface BuildPartArtifactsInput {
  readonly plan: readonly PartRange[];
  readonly baseName: string;
  readonly extension: string;
  readonly totalPages: number;
  readonly split: boolean;
}

export const buildPartArtifacts = ({
  plan,
  baseName,
  extension,
  totalPages,
  split,
}: BuildPartArtifactsInput): PartArtifact[] =>
  plan.map((part) => {
    const fileName = partFileName({
      baseName,
      extension,
      part,
      totalPages,
      split,
    });

    return {
      partNumber: part.partNumber,
      startPage: part.startPage,
      endPage: part.endPage,
      fileName,
      sidecarFileName: sidecarFileNameFor(fileName),
    };
  });

// parts.json is the hand off from the split CLI to the ingest CLI. The order of
// the array is the ingestion order.
export const buildPartsManifestFile = ({
  document,
  totalPages,
  parts,
  integratedFileName,
}: {
  document: DocumentMetadata;
  totalPages: number;
  parts: readonly PartArtifact[];
  integratedFileName?: string;
}): PartsManifestFile => ({
  documentId: document.document_id,
  originalFileName: document.original_file_name,
  totalPages,
  parts,
  ...(integratedFileName ? { integratedFileName } : {}),
});
