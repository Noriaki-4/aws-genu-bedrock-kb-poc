import { buildSidecar } from '../../../tools/rag-docs/core/sidecar';
import {
  estimateFilterableBytes,
  validateDocumentMetadata,
  validatePartRange,
  validateSidecar,
} from '../../../tools/rag-docs/core/validate';
import { DocumentMetadata } from '../../../tools/rag-docs/core/types';
import { MULTI_BYTE_TITLE, sampleDocumentMetadata } from './fixtures';

describe('validateDocumentMetadata', () => {
  it('accepts the sample document', () => {
    expect(validateDocumentMetadata(sampleDocumentMetadata())).toEqual([]);
  });

  it.each<[string, Partial<DocumentMetadata>, RegExp]>([
    [
      'an unexpected schema version',
      { metadata_schema_version: 2 },
      /metadata_schema_version/,
    ],
    [
      'an invalid document id',
      { document_id: 'OPS MANUAL/001' },
      /document_id/,
    ],
    ['a blank title', { document_title: '   ' }, /document_title/],
    [
      'an invalid organization id',
      { owner_organization_id: 'ORG A' },
      /owner_organization_id/,
    ],
    ['an invalid language tag', { language: 'Japanese' }, /language/],
    ['an impossible date', { effective_from: 20260230 }, /effective_from/],
    [
      'a start date after the end date',
      { effective_from: 20260801, effective_to: 20260731 },
      /effective_from must not be later/,
    ],
    ['an empty group list', { allowed_group_ids: [] }, /allowed_group_ids/],
    [
      'two organizations',
      { allowed_group_ids: ['org:ORG_A', 'org:ORG_B'] },
      /single organization/,
    ],
    [
      'common combined with an organization',
      { allowed_group_ids: ['common', 'org:ORG_A'] },
      /must not combine "common"/,
    ],
    [
      'an unsupported group id',
      { allowed_group_ids: ['ORG_A'] },
      /unsupported group id/,
    ],
    ['an empty role list', { allowed_role_ids: [] }, /allowed_role_ids/],
    [
      'ANY_ROLE combined with another role',
      { allowed_role_ids: ['ANY_ROLE', 'MANAGER'] },
      /ANY_ROLE/,
    ],
    ['an uppercase extension', { file_extension: 'PDF' }, /file_extension/],
    ['an extension with a dot', { file_extension: '.pdf' }, /file_extension/],
    [
      'a file name with a path separator',
      { original_file_name: 'docs/manual.pdf' },
      /path separator/,
    ],
    ['a malformed content hash', { content_hash: 'sha256:zz' }, /content_hash/],
    ['a non http source url', { source_url: 's3://bucket/key' }, /source_url/],
  ])('reports %s', (_label, overrides, expected) => {
    const errors = validateDocumentMetadata(sampleDocumentMetadata(overrides));

    expect(errors.join('\n')).toMatch(expected);
  });

  it('accepts departments of the same organization', () => {
    const errors = validateDocumentMetadata(
      sampleDocumentMetadata({
        allowed_group_ids: ['dept:ORG_A:SALES', 'dept:ORG_A:ACCOUNTING'],
      })
    );

    expect(errors).toEqual([]);
  });

  it('rejects departments of different organizations', () => {
    const errors = validateDocumentMetadata(
      sampleDocumentMetadata({
        allowed_group_ids: ['dept:ORG_A:SALES', 'dept:ORG_B:SALES'],
      })
    );

    expect(errors.join('\n')).toMatch(/single organization/);
  });
});

describe('validatePartRange', () => {
  it('accepts a normal range', () => {
    expect(
      validatePartRange({ partNumber: 2, startPage: 51, endPage: 100 })
    ).toEqual([]);
  });

  it.each([
    ['a part number below one', { partNumber: 0, startPage: 1, endPage: 10 }],
    ['a start page below one', { partNumber: 1, startPage: 0, endPage: 10 }],
    ['an inverted range', { partNumber: 1, startPage: 100, endPage: 51 }],
  ])('reports %s', (_label, part) => {
    expect(validatePartRange(part).length).toBeGreaterThan(0);
  });
});

describe('validateSidecar', () => {
  it('accepts a sidecar of a split part', () => {
    const sidecar = buildSidecar({
      document: sampleDocumentMetadata(),
      part: { partNumber: 2, startPage: 51, endPage: 100 },
    });

    expect(validateSidecar(sidecar)).toEqual([]);
  });

  it('reports a partially set split attribute trio', () => {
    const sidecar = buildSidecar({
      document: sampleDocumentMetadata(),
      part: { partNumber: 2, startPage: 51, endPage: 100 },
    });
    const broken = {
      metadataAttributes: Object.fromEntries(
        Object.entries(sidecar.metadataAttributes).filter(
          ([key]) => key !== 'original_page_end'
        )
      ),
    };

    expect(validateSidecar(broken).join('\n')).toMatch(/must be set together/);
  });

  it('reports a sidecar that exceeds the 1024 byte service limit', () => {
    const sidecar = buildSidecar({
      document: sampleDocumentMetadata({ document_title: 'x'.repeat(1200) }),
    });

    expect(validateSidecar(sidecar).join('\n')).toMatch(
      /exceeds the 1024 byte limit/
    );
  });

  it('accepts a sidecar that uses every optional attribute', () => {
    const sidecar = buildSidecar({
      document: sampleDocumentMetadata({
        document_title: MULTI_BYTE_TITLE,
        supersedes_version: '1.1',
        published_at: 20260625,
        source_url: 'https://documents.example.com/docs/OPS-MANUAL-001/1.2',
        content_hash: `sha256:${'a'.repeat(64)}`,
      }),
      part: { partNumber: 2, startPage: 51, endPage: 100 },
    });

    expect(validateSidecar(sidecar)).toEqual([]);
  });

  it('reports metadata that exceeds the S3 Vectors filterable budget', () => {
    const sidecar = buildSidecar({
      document: sampleDocumentMetadata({
        allowed_group_ids: Array.from(
          { length: 120 },
          (_value, index) => `dept:ORG_A:DEPARTMENT_${index}`
        ),
      }),
    });

    expect(validateSidecar(sidecar).join('\n')).toMatch(/filterable metadata/);
  });

  it('does not charge attributes that the index declares as non filterable', () => {
    const sidecar = buildSidecar({
      document: sampleDocumentMetadata({ document_title: MULTI_BYTE_TITLE }),
    });

    const withTitle = estimateFilterableBytes(sidecar);
    const withoutTitle = estimateFilterableBytes(sidecar, [
      'AMAZON_BEDROCK_TEXT',
      'AMAZON_BEDROCK_METADATA',
      'document_title',
    ]);

    // Each Japanese character takes three bytes in UTF-8.
    expect(withTitle - withoutTitle).toBe(
      'document_title'.length + MULTI_BYTE_TITLE.length * 3
    );
  });
});
