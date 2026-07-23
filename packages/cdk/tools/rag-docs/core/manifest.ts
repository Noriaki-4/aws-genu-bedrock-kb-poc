import { z } from 'zod';
import { parse as parseYaml } from 'yaml';
import {
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  DocumentMetadata,
  METADATA_SCHEMA_VERSION,
  ROLE_IDS,
} from './types';

// Author facing manifest. One manifest describes one original document.
// metadata_schema_version and content_hash are derived by the tool, so they are
// intentionally not authored here.
const documentSchema = z
  .object({
    document_id: z.string().min(1),
    document_title: z.string().min(1),
    document_type: z.enum(DOCUMENT_TYPES),
    language: z.string().min(1).optional(),
    version: z.string().min(1),
    supersedes_version: z.string().min(1).optional(),
    status: z.enum(DOCUMENT_STATUSES),
    published_at: z.number().optional(),
    effective_from: z.number(),
    effective_to: z.number(),
    owner_organization_id: z.string().min(1),
    owner_department_id: z.string().min(1).optional(),
    allowed_group_ids: z.array(z.string().min(1)),
    allowed_role_ids: z.array(z.enum(ROLE_IDS)),
    original_file_name: z.string().min(1).optional(),
    file_extension: z.string().min(1).optional(),
    source_url: z.string().min(1).optional(),
  })
  .strict();

const rangeSchema = z
  .object({
    start_page: z.number(),
    end_page: z.number(),
  })
  .strict();

const splitSchema = z
  .object({
    pages_per_part: z.number().optional(),
    ranges: z.array(rangeSchema).optional(),
  })
  .strict();

const manifestSchema = z
  .object({
    document: documentSchema,
    split: splitSchema.optional(),
  })
  .strict();

export type RagDocumentManifest = z.infer<typeof manifestSchema>;

export const DEFAULT_PAGES_PER_PART = 50;

// Parse a YAML manifest. Unknown keys are rejected so that a typo never turns
// into a silently missing metadata attribute.
export const parseManifest = (yamlText: string): RagDocumentManifest => {
  const parsed = manifestSchema.safeParse(parseYaml(yamlText));

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid manifest:\n${details}`);
  }

  return parsed.data;
};

const extensionOf = (fileName: string): string => {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex > 0 ? fileName.slice(dotIndex + 1).toLowerCase() : '';
};

export interface BuildDocumentMetadataInput {
  readonly manifest: RagDocumentManifest;
  // File name of the original document before splitting.
  readonly sourceFileName: string;
  readonly contentHash?: string;
}

// Merge the authored manifest with the values the tool derives from the input
// file. The result is the document level metadata shared by every part.
export const buildDocumentMetadata = ({
  manifest,
  sourceFileName,
  contentHash,
}: BuildDocumentMetadataInput): DocumentMetadata => {
  const { document } = manifest;
  const originalFileName = document.original_file_name ?? sourceFileName;

  return {
    metadata_schema_version: METADATA_SCHEMA_VERSION,
    document_id: document.document_id,
    document_title: document.document_title,
    document_type: document.document_type,
    ...(document.language ? { language: document.language } : {}),
    version: document.version,
    ...(document.supersedes_version
      ? { supersedes_version: document.supersedes_version }
      : {}),
    status: document.status,
    ...(document.published_at !== undefined
      ? { published_at: document.published_at }
      : {}),
    effective_from: document.effective_from,
    effective_to: document.effective_to,
    owner_organization_id: document.owner_organization_id,
    ...(document.owner_department_id
      ? { owner_department_id: document.owner_department_id }
      : {}),
    allowed_group_ids: document.allowed_group_ids,
    allowed_role_ids: document.allowed_role_ids,
    original_file_name: originalFileName,
    file_extension: document.file_extension ?? extensionOf(originalFileName),
    ...(document.source_url ? { source_url: document.source_url } : {}),
    ...(contentHash ? { content_hash: contentHash } : {}),
  };
};
