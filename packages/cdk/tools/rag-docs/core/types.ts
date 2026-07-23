// Shared types and fixed values for RAG document metadata.
// The definitions follow mydoc/GENU_RAG_METADATA_DEFINITION.md.
// This module must stay free of Node.js and AWS SDK imports so that the same
// logic can later be reused from a Lambda function.

export const METADATA_SCHEMA_VERSION = 1;

export const DOCUMENT_TYPES = [
  'MANUAL',
  'POLICY',
  'PROCEDURE',
  'REPORT',
  'FORM',
  'OTHER',
] as const;

export const DOCUMENT_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'SUPERSEDED',
  'EXPIRED',
  'REVOKED',
] as const;

export const ROLE_IDS = [
  'ANY_ROLE',
  'MEMBER',
  'MANAGER',
  'APPROVER',
  'AUDITOR',
] as const;

export const COMMON_GROUP_ID = 'common';

// IDs are limited to characters that survive S3 keys, metadata filters and URLs.
export const ID_PATTERN = /^[A-Za-z0-9_-]+$/;

export const NO_EXPIRY_DATE = 99991231;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];
export type RoleId = (typeof ROLE_IDS)[number];

// Document level metadata shared by every part of one original file.
export interface DocumentMetadata {
  readonly metadata_schema_version: number;
  readonly document_id: string;
  readonly document_title: string;
  readonly document_type: DocumentType;
  readonly language?: string;
  readonly version: string;
  readonly supersedes_version?: string;
  readonly status: DocumentStatus;
  readonly published_at?: number;
  readonly effective_from: number;
  readonly effective_to: number;
  readonly owner_organization_id: string;
  readonly owner_department_id?: string;
  readonly allowed_group_ids: readonly string[];
  readonly allowed_role_ids: readonly RoleId[];
  readonly original_file_name: string;
  readonly file_extension: string;
  readonly source_url?: string;
  readonly content_hash?: string;
}

// Page range of one split file. Pages are one-based and inclusive.
export interface PartRange {
  readonly partNumber: number;
  readonly startPage: number;
  readonly endPage: number;
}

// Metadata that only exists when the original PDF was split.
export interface PartMetadata {
  readonly part_number: number;
  readonly original_page_start: number;
  readonly original_page_end: number;
}

export type SidecarAttributeValue =
  | { readonly type: 'STRING'; readonly stringValue: string }
  | { readonly type: 'NUMBER'; readonly numberValue: number }
  | { readonly type: 'STRING_LIST'; readonly stringListValue: string[] };

export interface SidecarAttribute {
  readonly value: SidecarAttributeValue;
  readonly includeForEmbedding: boolean;
}

// Bedrock accepts two notations in the same sidecar. The verbose notation is
// the only way to set includeForEmbedding, but it costs about 60 extra bytes
// per attribute, and the sidecar file must stay within 1024 bytes. So the
// verbose notation is used only for the embedded attributes and the compact
// notation for everything else.
export type SidecarAttributeEntry =
  | SidecarAttribute
  | string
  | number
  | string[];

export interface Sidecar {
  readonly metadataAttributes: Record<string, SidecarAttributeEntry>;
}

// One split output file and the sidecar that belongs to it.
export interface PartArtifact {
  readonly partNumber: number;
  readonly startPage: number;
  readonly endPage: number;
  readonly fileName: string;
  readonly sidecarFileName: string;
}

export interface PartsManifestFile {
  readonly documentId: string;
  readonly originalFileName: string;
  readonly totalPages: number;
  readonly parts: readonly PartArtifact[];
  // File in the output directory that holds the integrated (pre-split) document.
  // The ingest tool uploads it to the originals/ prefix so citations can link to
  // it. Omitted for an unsplit document, which is served from docs/ directly.
  readonly integratedFileName?: string;
}
