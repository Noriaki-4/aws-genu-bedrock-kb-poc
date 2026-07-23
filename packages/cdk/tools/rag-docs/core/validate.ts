import { renderSidecar } from './sidecar';
import {
  COMMON_GROUP_ID,
  DocumentMetadata,
  ID_PATTERN,
  METADATA_SCHEMA_VERSION,
  PartRange,
  Sidecar,
  SidecarAttributeEntry,
} from './types';

// S3 Vectors stores at most 2 KB of filterable metadata per vector. Bedrock adds
// its own filterable system attributes (source URI, data source id, page number),
// so part of the budget is reserved for them.
// https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors-limitations.html
export const S3_VECTORS_FILTERABLE_METADATA_LIMIT_BYTES = 2048;
export const BEDROCK_SYSTEM_METADATA_RESERVE_BYTES = 512;

// Measured against the service on 2026-07-21. The Bedrock documentation states
// 10 KB, but ingestion reports
//   "Ignored N files as the associated metadata was larger than service limit
//    of MaximumFileSizeSupported: 1024 bytes"
// and silently skips the document without counting it as a failure. The
// observed limit is the one that is enforced.
export const SIDECAR_MAX_BYTES = 1024;

// Keys declared as nonFilterableMetadataKeys on the vector index. They do not
// consume the filterable budget. Keep in sync with rag-knowledge-base-stack.ts.
export const DEFAULT_NON_FILTERABLE_KEYS: readonly string[] = [
  'AMAZON_BEDROCK_TEXT',
  'AMAZON_BEDROCK_METADATA',
];

const PART_KEYS = [
  'part_number',
  'original_page_start',
  'original_page_end',
] as const;

const utf8Length = (text: string): number =>
  new TextEncoder().encode(text).length;

const isValidDateNumber = (value: number): boolean => {
  if (!Number.isSafeInteger(value) || value < 10000101 || value > 99991231) {
    return false;
  }

  const year = Math.floor(value / 10000);
  const month = Math.floor(value / 100) % 100;
  const day = value % 100;

  if (month < 1 || month > 12 || day < 1) return false;

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
};

const organizationOfGroupId = (groupId: string): string | undefined => {
  const orgMatch = /^org:([^:]+)$/.exec(groupId);
  if (orgMatch) return orgMatch[1];

  const deptMatch = /^dept:([^:]+):([^:]+)$/.exec(groupId);
  if (deptMatch) return deptMatch[1];

  return undefined;
};

const validateGroupIds = (groupIds: readonly string[]): string[] => {
  if (groupIds.length === 0) {
    return ['allowed_group_ids must not be empty'];
  }

  const errors: string[] = [];

  if (groupIds.includes(COMMON_GROUP_ID) && groupIds.length > 1) {
    errors.push(
      `allowed_group_ids must not combine "${COMMON_GROUP_ID}" with other groups`
    );
  }

  if (new Set(groupIds).size !== groupIds.length) {
    errors.push('allowed_group_ids must not contain duplicates');
  }

  const organizations = new Set<string>();

  for (const groupId of groupIds) {
    if (groupId === COMMON_GROUP_ID) continue;

    const organization = organizationOfGroupId(groupId);
    if (!organization) {
      errors.push(
        `allowed_group_ids contains an unsupported group id: ${groupId}`
      );
      continue;
    }

    const idTokens = groupId.split(':').slice(1);
    if (idTokens.some((token) => !ID_PATTERN.test(token))) {
      errors.push(`allowed_group_ids contains an invalid id: ${groupId}`);
      continue;
    }

    organizations.add(organization);
  }

  if (organizations.size > 1) {
    errors.push(
      `allowed_group_ids must stay within a single organization, but found ${[...organizations].join(', ')}`
    );
  }

  return errors;
};

const validateRoleIds = (roleIds: readonly string[]): string[] => {
  if (roleIds.length === 0) {
    return ['allowed_role_ids must not be empty'];
  }

  const errors: string[] = [];

  if (roleIds.includes('ANY_ROLE') && roleIds.length > 1) {
    errors.push('allowed_role_ids must not combine ANY_ROLE with other roles');
  }
  if (new Set(roleIds).size !== roleIds.length) {
    errors.push('allowed_role_ids must not contain duplicates');
  }

  return errors;
};

// Validate the document level metadata. Returns every violation so that the
// operator can fix the manifest in one pass.
export const validateDocumentMetadata = (
  document: DocumentMetadata
): string[] => {
  const errors: string[] = [];

  if (document.metadata_schema_version !== METADATA_SCHEMA_VERSION) {
    errors.push(
      `metadata_schema_version must be ${METADATA_SCHEMA_VERSION}, but received ${document.metadata_schema_version}`
    );
  }
  if (!ID_PATTERN.test(document.document_id)) {
    errors.push(`document_id must match ${ID_PATTERN}`);
  }
  if (document.document_title.trim() === '') {
    errors.push('document_title must not be blank');
  }
  if (!ID_PATTERN.test(document.owner_organization_id)) {
    errors.push(`owner_organization_id must match ${ID_PATTERN}`);
  }
  if (
    document.owner_department_id !== undefined &&
    !ID_PATTERN.test(document.owner_department_id)
  ) {
    errors.push(`owner_department_id must match ${ID_PATTERN}`);
  }
  if (
    document.language !== undefined &&
    !/^[a-z]{2,3}(-[A-Za-z0-9]+)*$/.test(document.language)
  ) {
    errors.push('language must be a lowercase language tag such as ja');
  }

  for (const key of [
    'published_at',
    'effective_from',
    'effective_to',
  ] as const) {
    const value = document[key];
    if (value !== undefined && !isValidDateNumber(value)) {
      errors.push(
        `${key} must be a valid YYYYMMDD date, but received ${value}`
      );
    }
  }

  if (
    isValidDateNumber(document.effective_from) &&
    isValidDateNumber(document.effective_to) &&
    document.effective_from > document.effective_to
  ) {
    errors.push('effective_from must not be later than effective_to');
  }

  errors.push(...validateGroupIds(document.allowed_group_ids));
  errors.push(...validateRoleIds(document.allowed_role_ids));

  if (!/^[a-z0-9]+$/.test(document.file_extension)) {
    errors.push(
      `file_extension must be lowercase without a leading dot, but received ${document.file_extension}`
    );
  }
  if (/[/\\]/.test(document.original_file_name)) {
    errors.push('original_file_name must not contain a path separator');
  }
  if (
    document.content_hash !== undefined &&
    !/^sha256:[0-9a-f]{64}$/.test(document.content_hash)
  ) {
    errors.push('content_hash must be formatted as sha256:<64 hex characters>');
  }
  if (
    document.source_url !== undefined &&
    !/^https?:\/\/\S+$/.test(document.source_url)
  ) {
    errors.push('source_url must be an http or https URL');
  }

  return errors;
};

export const validatePartRange = (part: PartRange): string[] => {
  const errors: string[] = [];

  if (!Number.isSafeInteger(part.partNumber) || part.partNumber < 1) {
    errors.push('part_number must be an integer of 1 or greater');
  }
  if (!Number.isSafeInteger(part.startPage) || part.startPage < 1) {
    errors.push('original_page_start must be an integer of 1 or greater');
  }
  if (part.endPage < part.startPage) {
    errors.push(
      'original_page_end must not be smaller than original_page_start'
    );
  }

  return errors;
};

const serializedValueOf = (entry: SidecarAttributeEntry): string => {
  if (typeof entry === 'string') return entry;
  if (typeof entry === 'number') return String(entry);
  if (Array.isArray(entry)) return JSON.stringify(entry);

  const { value } = entry;
  return value.type === 'STRING'
    ? value.stringValue
    : value.type === 'NUMBER'
      ? String(value.numberValue)
      : JSON.stringify(value.stringListValue);
};

const serializedLengthOf = (sidecar: Sidecar, key: string): number =>
  utf8Length(key) +
  utf8Length(serializedValueOf(sidecar.metadataAttributes[key]));

// Estimate how much of the S3 Vectors filterable metadata budget the sidecar
// consumes. Attributes declared as non filterable on the index are excluded.
export const estimateFilterableBytes = (
  sidecar: Sidecar,
  nonFilterableKeys: readonly string[] = DEFAULT_NON_FILTERABLE_KEYS
): number =>
  Object.keys(sidecar.metadataAttributes)
    .filter((key) => !nonFilterableKeys.includes(key))
    .reduce((total, key) => total + serializedLengthOf(sidecar, key), 0);

export interface ValidateSidecarOptions {
  readonly nonFilterableKeys?: readonly string[];
}

// Validate the rendered sidecar against the Bedrock and S3 Vectors limits and
// against the all-or-none rule for the split attributes.
export const validateSidecar = (
  sidecar: Sidecar,
  options: ValidateSidecarOptions = {}
): string[] => {
  const errors: string[] = [];
  const presentPartKeys = PART_KEYS.filter(
    (key) => sidecar.metadataAttributes[key] !== undefined
  );

  if (
    presentPartKeys.length !== 0 &&
    presentPartKeys.length !== PART_KEYS.length
  ) {
    errors.push(
      `part_number, original_page_start and original_page_end must be set together, but only ${presentPartKeys.join(', ')} are present`
    );
  }

  const sidecarBytes = utf8Length(renderSidecar(sidecar));
  if (sidecarBytes > SIDECAR_MAX_BYTES) {
    errors.push(
      `the sidecar is ${sidecarBytes} bytes, which exceeds the ${SIDECAR_MAX_BYTES} byte limit. ` +
        'Bedrock ignores the document without reporting it as a failed document'
    );
  }

  const filterableBudget =
    S3_VECTORS_FILTERABLE_METADATA_LIMIT_BYTES -
    BEDROCK_SYSTEM_METADATA_RESERVE_BYTES;
  const filterableBytes = estimateFilterableBytes(
    sidecar,
    options.nonFilterableKeys
  );

  if (filterableBytes > filterableBudget) {
    errors.push(
      `the filterable metadata is about ${filterableBytes} bytes, which exceeds the ${filterableBudget} byte budget. Declare display only attributes in nonFilterableMetadataKeys on the vector index`
    );
  }

  return errors;
};
