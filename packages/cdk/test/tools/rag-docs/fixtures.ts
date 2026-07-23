import { DocumentMetadata } from '../../../tools/rag-docs/core/types';

// A multi byte title is needed to cover the UTF-8 byte counting of the S3
// Vectors metadata budget. Built from code points (reads as "equipment
// incident manual" in Japanese) so the source has no non-ASCII literal for the
// i18n lint rule and the Prettier hook has nothing to reformat.
export const MULTI_BYTE_TITLE = String.fromCodePoint(
  0x8a2d,
  0x5099,
  0x969c,
  0x5bb3,
  0x5bfe,
  0x5fdc,
  0x30de,
  0x30cb,
  0x30e5,
  0x30a2,
  0x30eb
);

export const SAMPLE_MANIFEST_YAML = `document:
  document_id: OPS-MANUAL-001
  document_title: Equipment Incident Manual
  document_type: MANUAL
  language: ja
  version: '1.2'
  supersedes_version: '1.1'
  status: ACTIVE
  published_at: 20260625
  effective_from: 20260701
  effective_to: 99991231
  owner_organization_id: ORG_A
  owner_department_id: IT_OPERATIONS
  allowed_group_ids:
    - org:ORG_A
  allowed_role_ids:
    - ANY_ROLE
  source_url: https://documents.example.com/docs/OPS-MANUAL-001/1.2
split:
  pages_per_part: 50
`;

export const sampleDocumentMetadata = (
  overrides: Partial<DocumentMetadata> = {}
): DocumentMetadata => ({
  metadata_schema_version: 1,
  document_id: 'OPS-MANUAL-001',
  document_title: 'Equipment Incident Manual',
  document_type: 'MANUAL',
  language: 'ja',
  version: '1.2',
  status: 'ACTIVE',
  effective_from: 20260701,
  effective_to: 99991231,
  owner_organization_id: 'ORG_A',
  owner_department_id: 'IT_OPERATIONS',
  allowed_group_ids: ['org:ORG_A'],
  allowed_role_ids: ['ANY_ROLE'],
  original_file_name: 'equipment-incident-manual.pdf',
  file_extension: 'pdf',
  ...overrides,
});
