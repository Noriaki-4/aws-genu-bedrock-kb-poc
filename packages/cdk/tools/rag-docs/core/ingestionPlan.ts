import { PartArtifact } from './types';

// Parts are ingested one at a time, so a failed run can be resumed from the part
// that failed instead of re-parsing the whole document.
export const selectPartsToIngest = (
  parts: readonly PartArtifact[],
  startFrom = 1
): PartArtifact[] => {
  const selected = parts.filter((part) => part.partNumber >= startFrom);

  if (selected.length === 0) {
    throw new Error(
      `No part with a number of ${startFrom} or greater exists in parts.json`
    );
  }

  return selected;
};

export const objectKeyFor = (prefix: string, fileName: string): string =>
  `${prefix.endsWith('/') ? prefix : `${prefix}/`}${fileName}`;

// Prefix for the integrated (pre-split) document, outside the data source
// inclusion prefix (docs/) so it is served but not parsed. Must match
// INTEGRATED_DOCUMENT_PREFIX in lambda/utils/bedrockKbCitation.ts.
export const INTEGRATED_DOCUMENT_PREFIX = 'originals/';

// Objects that already sit under the prefix but are not part of this split.
// Leaving the unsplit original next to the parts would index the same pages
// twice and duplicate citations.
export const findStaleObjectKeys = ({
  existingKeys,
  expectedKeys,
}: {
  existingKeys: readonly string[];
  expectedKeys: readonly string[];
}): string[] => {
  const expected = new Set(expectedKeys);

  return existingKeys.filter((key) => !expected.has(key));
};
