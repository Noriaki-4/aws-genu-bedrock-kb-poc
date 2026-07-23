import {
  buildDocumentMetadata,
  parseManifest,
} from '../../../tools/rag-docs/core/manifest';
import { SAMPLE_MANIFEST_YAML } from './fixtures';

describe('parseManifest', () => {
  it('parses a complete manifest', () => {
    const manifest = parseManifest(SAMPLE_MANIFEST_YAML);

    expect(manifest.document.document_id).toBe('OPS-MANUAL-001');
    expect(manifest.document.allowed_group_ids).toEqual(['org:ORG_A']);
    expect(manifest.split?.pages_per_part).toBe(50);
  });

  it('rejects an unknown key so that a typo never becomes a missing attribute', () => {
    const yamlText = SAMPLE_MANIFEST_YAML.replace(
      '  status: ACTIVE',
      '  status: ACTIVE\n  department_name: IT'
    );

    expect(() => parseManifest(yamlText)).toThrow(/department_name/);
  });

  it('rejects a value outside the fixed value list', () => {
    const yamlText = SAMPLE_MANIFEST_YAML.replace(
      'status: ACTIVE',
      'status: ENABLED'
    );

    expect(() => parseManifest(yamlText)).toThrow(/status/);
  });

  it('rejects a manifest without a required attribute', () => {
    const yamlText = SAMPLE_MANIFEST_YAML.replace(
      '  document_id: OPS-MANUAL-001\n',
      ''
    );

    expect(() => parseManifest(yamlText)).toThrow(/document_id/);
  });
});

describe('buildDocumentMetadata', () => {
  const manifest = parseManifest(SAMPLE_MANIFEST_YAML);

  it('derives the file name, extension and schema version from the input', () => {
    const document = buildDocumentMetadata({
      manifest,
      sourceFileName: 'equipment-incident-manual.PDF',
    });

    expect(document.original_file_name).toBe('equipment-incident-manual.PDF');
    expect(document.file_extension).toBe('pdf');
    expect(document.metadata_schema_version).toBe(1);
  });

  it('keeps the authored file name when the manifest sets one', () => {
    const withFileName = parseManifest(
      SAMPLE_MANIFEST_YAML.replace(
        '  document_type: MANUAL',
        '  document_type: MANUAL\n  original_file_name: original.pdf'
      )
    );

    const document = buildDocumentMetadata({
      manifest: withFileName,
      sourceFileName: 'split-source.pdf',
    });

    expect(document.original_file_name).toBe('original.pdf');
  });

  it('omits conditional attributes instead of writing null', () => {
    const minimal = parseManifest(
      SAMPLE_MANIFEST_YAML.replace("  supersedes_version: '1.1'\n", '')
        .replace('  published_at: 20260625\n', '')
        .replace('  owner_department_id: IT_OPERATIONS\n', '')
        .replace('  language: ja\n', '')
    );

    const document = buildDocumentMetadata({
      manifest: minimal,
      sourceFileName: 'manual.pdf',
    });

    expect(document).not.toHaveProperty('supersedes_version');
    expect(document).not.toHaveProperty('published_at');
    expect(document).not.toHaveProperty('owner_department_id');
    expect(document).not.toHaveProperty('language');
    expect(document).not.toHaveProperty('content_hash');
  });

  it('adds the content hash when the tool computed one', () => {
    const document = buildDocumentMetadata({
      manifest,
      sourceFileName: 'manual.pdf',
      contentHash: `sha256:${'a'.repeat(64)}`,
    });

    expect(document.content_hash).toBe(`sha256:${'a'.repeat(64)}`);
  });
});
