import {
  findStaleObjectKeys,
  objectKeyFor,
  selectPartsToIngest,
} from '../../../tools/rag-docs/core/ingestionPlan';
import { buildPartArtifacts } from '../../../tools/rag-docs/core/partArtifacts';
import { buildSplitPlan } from '../../../tools/rag-docs/core/splitPlan';

const parts = buildPartArtifacts({
  plan: buildSplitPlan({ totalPages: 150, pagesPerPart: 50 }),
  baseName: 'manual',
  extension: 'pdf',
  totalPages: 150,
  split: true,
});

describe('selectPartsToIngest', () => {
  it('returns every part by default', () => {
    expect(selectPartsToIngest(parts).map((part) => part.partNumber)).toEqual([
      1, 2, 3,
    ]);
  });

  it('resumes from the requested part', () => {
    expect(
      selectPartsToIngest(parts, 2).map((part) => part.partNumber)
    ).toEqual([2, 3]);
  });

  it('throws when the requested part does not exist', () => {
    expect(() => selectPartsToIngest(parts, 4)).toThrow(/No part/);
  });
});

describe('objectKeyFor', () => {
  it.each([
    ['docs/manual/', 'docs/manual/a.pdf'],
    ['docs/manual', 'docs/manual/a.pdf'],
  ])('normalises the trailing slash of %s', (prefix, expected) => {
    expect(objectKeyFor(prefix, 'a.pdf')).toBe(expected);
  });
});

describe('findStaleObjectKeys', () => {
  it('reports objects that this split does not own', () => {
    expect(
      findStaleObjectKeys({
        existingKeys: [
          'docs/manual/manual.pdf',
          'docs/manual/manual_p0001-0050.pdf',
        ],
        expectedKeys: [
          'docs/manual/manual_p0001-0050.pdf',
          'docs/manual/manual_p0001-0050.pdf.metadata.json',
        ],
      })
    ).toEqual(['docs/manual/manual.pdf']);
  });

  it('reports nothing when the prefix only holds the expected objects', () => {
    expect(
      findStaleObjectKeys({
        existingKeys: ['docs/manual/manual_p0001-0050.pdf'],
        expectedKeys: [
          'docs/manual/manual_p0001-0050.pdf',
          'docs/manual/manual_p0001-0050.pdf.metadata.json',
        ],
      })
    ).toEqual([]);
  });
});
