import {
  buildSidecar,
  renderSidecar,
  sidecarFileNameFor,
} from '../../../tools/rag-docs/core/sidecar';
import { SIDECAR_MAX_BYTES } from '../../../tools/rag-docs/core/validate';
import { MULTI_BYTE_TITLE, sampleDocumentMetadata } from './fixtures';

describe('buildSidecar', () => {
  it('omits the split attributes for an unsplit document', () => {
    const sidecar = buildSidecar({ document: sampleDocumentMetadata() });

    expect(sidecar.metadataAttributes).not.toHaveProperty('part_number');
    expect(sidecar.metadataAttributes).not.toHaveProperty(
      'original_page_start'
    );
    expect(sidecar.metadataAttributes).not.toHaveProperty('original_page_end');
  });

  it('writes the three split attributes together for a split part', () => {
    const sidecar = buildSidecar({
      document: sampleDocumentMetadata(),
      part: { partNumber: 2, startPage: 51, endPage: 100 },
    });

    expect(sidecar.metadataAttributes.part_number).toBe(2);
    expect(sidecar.metadataAttributes.original_page_start).toBe(51);
    expect(sidecar.metadataAttributes.original_page_end).toBe(100);
  });

  it('uses the verbose notation only for the embedded title', () => {
    const sidecar = buildSidecar({
      document: sampleDocumentMetadata(),
      part: { partNumber: 1, startPage: 1, endPage: 50 },
    });

    expect(sidecar.metadataAttributes.document_title).toEqual({
      value: { type: 'STRING', stringValue: 'Equipment Incident Manual' },
      includeForEmbedding: true,
    });

    const verboseKeys = Object.entries(sidecar.metadataAttributes)
      .filter(
        ([, entry]) =>
          typeof entry === 'object' && !Array.isArray(entry) && 'value' in entry
      )
      .map(([key]) => key);

    expect(verboseKeys).toEqual(['document_title']);
  });

  it('writes the other attributes in the compact notation', () => {
    const sidecar = buildSidecar({ document: sampleDocumentMetadata() });

    expect(sidecar.metadataAttributes.document_id).toBe('OPS-MANUAL-001');
    expect(sidecar.metadataAttributes.effective_from).toBe(20260701);
    expect(sidecar.metadataAttributes.allowed_group_ids).toEqual(['org:ORG_A']);
  });

  it('omits conditional attributes that the document does not define', () => {
    const sidecar = buildSidecar({
      document: sampleDocumentMetadata({ language: undefined }),
    });

    expect(sidecar.metadataAttributes).not.toHaveProperty('language');
  });

  it('keeps the attribute order of the metadata definition', () => {
    const sidecar = buildSidecar({
      document: sampleDocumentMetadata(),
      part: { partNumber: 2, startPage: 51, endPage: 100 },
    });

    expect(Object.keys(sidecar.metadataAttributes).slice(0, 4)).toEqual([
      'metadata_schema_version',
      'document_id',
      'document_title',
      'document_type',
    ]);
    expect(Object.keys(sidecar.metadataAttributes).slice(-3)).toEqual([
      'part_number',
      'original_page_start',
      'original_page_end',
    ]);
  });
});

describe('renderSidecar', () => {
  it('renders minified JSON so that the file fits the service limit', () => {
    const sidecar = buildSidecar({
      document: sampleDocumentMetadata({
        document_title: MULTI_BYTE_TITLE,
        source_url: 'https://documents.example.com/docs/OPS-MANUAL-001/1.2',
        content_hash: `sha256:${'a'.repeat(64)}`,
        supersedes_version: '1.1',
        published_at: 20260625,
      }),
      part: { partNumber: 2, startPage: 51, endPage: 100 },
    });
    const rendered = renderSidecar(sidecar);

    expect(rendered).not.toContain('\n');
    expect(JSON.parse(rendered)).toEqual(sidecar);
    expect(Buffer.byteLength(rendered)).toBeLessThanOrEqual(SIDECAR_MAX_BYTES);
  });
});

describe('sidecarFileNameFor', () => {
  it('appends the Bedrock sidecar suffix to the file name', () => {
    expect(sidecarFileNameFor('manual_p0051-0100.pdf')).toBe(
      'manual_p0051-0100.pdf.metadata.json'
    );
  });
});
