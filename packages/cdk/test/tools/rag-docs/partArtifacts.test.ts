import {
  buildPartArtifacts,
  buildPartsManifestFile,
  partFileName,
} from '../../../tools/rag-docs/core/partArtifacts';
import { buildSplitPlan } from '../../../tools/rag-docs/core/splitPlan';
import { sampleDocumentMetadata } from './fixtures';

describe('partFileName', () => {
  it('adds a zero padded page range for a split part', () => {
    expect(
      partFileName({
        baseName: 'manual',
        extension: 'pdf',
        part: { partNumber: 2, startPage: 51, endPage: 100 },
        totalPages: 276,
        split: true,
      })
    ).toBe('manual_p0051-0100.pdf');
  });

  it('widens the padding for documents with more than four digits of pages', () => {
    expect(
      partFileName({
        baseName: 'manual',
        extension: 'pdf',
        part: { partNumber: 1, startPage: 1, endPage: 50 },
        totalPages: 12345,
        split: true,
      })
    ).toBe('manual_p00001-00050.pdf');
  });

  it('keeps the original name when the document is not split', () => {
    expect(
      partFileName({
        baseName: 'manual',
        extension: 'pdf',
        part: { partNumber: 1, startPage: 1, endPage: 3 },
        totalPages: 3,
        split: false,
      })
    ).toBe('manual.pdf');
  });
});

describe('buildPartArtifacts', () => {
  it('pairs every part with its sidecar file name', () => {
    const artifacts = buildPartArtifacts({
      plan: buildSplitPlan({ totalPages: 276, pagesPerPart: 50 }),
      baseName: 'manual',
      extension: 'pdf',
      totalPages: 276,
      split: true,
    });

    expect(artifacts).toHaveLength(6);
    expect(artifacts[1]).toEqual({
      partNumber: 2,
      startPage: 51,
      endPage: 100,
      fileName: 'manual_p0051-0100.pdf',
      sidecarFileName: 'manual_p0051-0100.pdf.metadata.json',
    });
    expect(artifacts[5].fileName).toBe('manual_p0251-0276.pdf');
  });
});

describe('buildPartsManifestFile', () => {
  it('records the document identity next to the ingestion order', () => {
    const parts = buildPartArtifacts({
      plan: buildSplitPlan({ totalPages: 120, pagesPerPart: 50 }),
      baseName: 'manual',
      extension: 'pdf',
      totalPages: 120,
      split: true,
    });

    const manifestFile = buildPartsManifestFile({
      document: sampleDocumentMetadata(),
      totalPages: 120,
      parts,
      integratedFileName: 'equipment-incident-manual.pdf',
    });

    expect(manifestFile.documentId).toBe('OPS-MANUAL-001');
    expect(manifestFile.originalFileName).toBe('equipment-incident-manual.pdf');
    expect(manifestFile.integratedFileName).toBe(
      'equipment-incident-manual.pdf'
    );
    expect(manifestFile.parts.map((part) => part.partNumber)).toEqual([
      1, 2, 3,
    ]);
  });

  it('omits the integrated file name for an unsplit document', () => {
    const parts = buildPartArtifacts({
      plan: buildSplitPlan({ totalPages: 3, pagesPerPart: 50 }),
      baseName: 'manual',
      extension: 'pdf',
      totalPages: 3,
      split: false,
    });

    const manifestFile = buildPartsManifestFile({
      document: sampleDocumentMetadata(),
      totalPages: 3,
      parts,
    });

    expect(manifestFile).not.toHaveProperty('integratedFileName');
  });
});
