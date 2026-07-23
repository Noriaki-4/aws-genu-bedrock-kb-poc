import {
  DocumentMetadata,
  PartRange,
  Sidecar,
  SidecarAttributeEntry,
  SidecarAttributeValue,
} from './types';

// Only the title is embedded. Access control and lifecycle attributes are used
// for filtering and display (GENU_RAG_METADATA_DEFINITION.md 3.3).
const EMBEDDED_KEYS = new Set(['document_title']);

// Attribute order follows the definition table so that generated files stay
// readable during review.
const ATTRIBUTE_ORDER = [
  'metadata_schema_version',
  'document_id',
  'document_title',
  'document_type',
  'language',
  'version',
  'supersedes_version',
  'status',
  'published_at',
  'effective_from',
  'effective_to',
  'owner_organization_id',
  'owner_department_id',
  'allowed_group_ids',
  'allowed_role_ids',
  'original_file_name',
  'file_extension',
  'source_url',
  'content_hash',
  'part_number',
  'original_page_start',
  'original_page_end',
] as const;

const toAttributeValue = (
  value: string | number | readonly string[]
): SidecarAttributeValue => {
  if (typeof value === 'number') {
    return { type: 'NUMBER', numberValue: value };
  }
  if (typeof value === 'string') {
    return { type: 'STRING', stringValue: value };
  }
  return { type: 'STRING_LIST', stringListValue: [...value] };
};

export interface BuildSidecarInput {
  readonly document: DocumentMetadata;
  // Omitted for an unsplit document.
  readonly part?: PartRange;
}

// Build the sidecar metadata of one ingested file. The part attributes are
// written as a set of three or not at all.
export const buildSidecar = ({
  document,
  part,
}: BuildSidecarInput): Sidecar => {
  const flat: Record<string, string | number | readonly string[]> = {
    ...document,
    ...(part
      ? {
          part_number: part.partNumber,
          original_page_start: part.startPage,
          original_page_end: part.endPage,
        }
      : {}),
  };

  const metadataAttributes = ATTRIBUTE_ORDER.reduce<
    Record<string, SidecarAttributeEntry>
  >((accumulator, key) => {
    const value = flat[key];
    if (value === undefined) return accumulator;

    return {
      ...accumulator,
      [key]: EMBEDDED_KEYS.has(key)
        ? { value: toAttributeValue(value), includeForEmbedding: true }
        : Array.isArray(value)
          ? [...value]
          : (value as string | number),
    };
  }, {});

  return { metadataAttributes };
};

// The rendered file must stay within the 1024 byte service limit, so it is
// written without indentation and without a trailing newline.
export const renderSidecar = (sidecar: Sidecar): string =>
  JSON.stringify(sidecar);

// Bedrock expects the sidecar next to the ingested file.
export const sidecarFileNameFor = (fileName: string): string =>
  `${fileName}.metadata.json`;
