import { createHash } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { basename, extname, join } from 'path';
import { PDFDocument } from 'pdf-lib';
import {
  buildPartArtifacts,
  buildPartsManifestFile,
} from '../core/partArtifacts';
import {
  DEFAULT_PAGES_PER_PART,
  buildDocumentMetadata,
  parseManifest,
} from '../core/manifest';
import { buildSidecar, renderSidecar } from '../core/sidecar';
import { buildSplitPlan, isSplitPlan } from '../core/splitPlan';
import { PartRange, Sidecar } from '../core/types';
import {
  validateDocumentMetadata,
  validatePartRange,
  validateSidecar,
} from '../core/validate';
import { optionalNumberArg, parseArgs, requireArg } from './args';

const USAGE = `Usage:
  npx ts-node tools/rag-docs/cli/split.ts \\
    --manifest <path to the document manifest yaml> \\
    --input <path to the original pdf> \\
    --out-dir <output directory> \\
    [--pages-per-part 50]

Large PDFs may need a bigger heap:
  NODE_OPTIONS=--max-old-space-size=4096 npx ts-node ...`;

interface PlannedPart {
  readonly range: PartRange;
  readonly fileName: string;
  readonly sidecarFileName: string;
  readonly sidecar: Sidecar;
}

const sha256Of = (bytes: Uint8Array): string =>
  `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

// Write one split PDF that contains the pages of the given range.
const writePartPdf = async ({
  source,
  range,
  outputPath,
}: {
  source: PDFDocument;
  range: PartRange;
  outputPath: string;
}): Promise<void> => {
  const output = await PDFDocument.create();
  const pageIndices = Array.from(
    { length: range.endPage - range.startPage + 1 },
    (_value, offset) => range.startPage - 1 + offset
  );

  const copiedPages = await output.copyPages(source, pageIndices);
  for (const page of copiedPages) {
    output.addPage(page);
  }

  await writeFile(outputPath, await output.save());
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const manifestPath = requireArg(args, 'manifest');
  const inputPath = requireArg(args, 'input');
  const outDir = requireArg(args, 'out-dir');

  const manifest = parseManifest(await readFile(manifestPath, 'utf8'));
  const inputBytes = await readFile(inputPath);
  const sourceFileName = basename(inputPath);

  const document = buildDocumentMetadata({
    manifest,
    sourceFileName,
    contentHash: sha256Of(inputBytes),
  });

  const documentErrors = validateDocumentMetadata(document);
  if (documentErrors.length > 0) {
    throw new Error(
      `The document metadata is invalid:\n- ${documentErrors.join('\n- ')}`
    );
  }

  const source = await PDFDocument.load(inputBytes);
  const totalPages = source.getPageCount();

  const plan = buildSplitPlan({
    totalPages,
    pagesPerPart:
      optionalNumberArg(args, 'pages-per-part') ??
      manifest.split?.pages_per_part ??
      DEFAULT_PAGES_PER_PART,
    ranges: manifest.split?.ranges?.map((range) => ({
      startPage: range.start_page,
      endPage: range.end_page,
    })),
  });
  const split = isSplitPlan(plan);

  const artifacts = buildPartArtifacts({
    plan,
    baseName: basename(sourceFileName, extname(sourceFileName)),
    extension: document.file_extension,
    totalPages,
    split,
  });

  // Build and validate everything before writing, so that an invalid manifest
  // never leaves a half written output directory behind.
  const plannedParts: PlannedPart[] = artifacts.map((artifact) => {
    const range: PartRange = {
      partNumber: artifact.partNumber,
      startPage: artifact.startPage,
      endPage: artifact.endPage,
    };
    const sidecar = buildSidecar({
      document,
      part: split ? range : undefined,
    });

    const errors = [
      ...(split ? validatePartRange(range) : []),
      ...validateSidecar(sidecar),
    ];
    if (errors.length > 0) {
      throw new Error(
        `The sidecar of part ${artifact.partNumber} is invalid:\n- ${errors.join('\n- ')}`
      );
    }

    return {
      range,
      fileName: artifact.fileName,
      sidecarFileName: artifact.sidecarFileName,
      sidecar,
    };
  });

  await mkdir(outDir, { recursive: true });

  for (const part of plannedParts) {
    await writeFile(
      join(outDir, part.sidecarFileName),
      renderSidecar(part.sidecar)
    );
    await writePartPdf({
      source,
      range: part.range,
      outputPath: join(outDir, part.fileName),
    });
    console.log(
      `part ${part.range.partNumber}: pages ${part.range.startPage}-${part.range.endPage} -> ${part.fileName}`
    );
  }

  // For a split document, keep a copy of the integrated (pre-split) PDF so the
  // ingest tool can upload it to originals/. Citations link back to this file
  // at the original page number. An unsplit document is served from docs/.
  const integratedFileName = split ? document.original_file_name : undefined;
  if (integratedFileName) {
    await writeFile(join(outDir, integratedFileName), inputBytes);
    console.log(`integrated document -> ${integratedFileName}`);
  }

  const partsManifestPath = join(outDir, 'parts.json');
  await writeFile(
    partsManifestPath,
    `${JSON.stringify(
      buildPartsManifestFile({
        document,
        totalPages,
        parts: artifacts,
        integratedFileName,
      }),
      null,
      2
    )}\n`
  );

  console.log(
    `Wrote ${plannedParts.length} part(s) of ${totalPages} pages to ${outDir}`
  );
  console.log(`Ingestion order is recorded in ${partsManifestPath}`);
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  console.error(`\n${USAGE}`);
  process.exitCode = 1;
});
