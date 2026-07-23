import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import {
  BedrockAgentClient,
  GetIngestionJobCommand,
  StartIngestionJobCommand,
} from '@aws-sdk/client-bedrock-agent';
import {
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import {
  INTEGRATED_DOCUMENT_PREFIX,
  findStaleObjectKeys,
  objectKeyFor,
  selectPartsToIngest,
} from '../core/ingestionPlan';
import { PartArtifact, PartsManifestFile } from '../core/types';
import { optionalNumberArg, parseArgs, requireArg } from './args';

const USAGE = `Usage:
  AWS_PROFILE=<profile> npx ts-node tools/rag-docs/cli/ingest.ts \\
    --parts <out-dir>/parts.json \\
    --bucket <DataSourceBucketName> \\
    --prefix docs/<document id>/ \\
    --knowledge-base-id <KnowledgeBaseId> \\
    --data-source-id <DataSourceId> \\
    [--region ap-northeast-1] [--start-from 1] [--poll-interval-seconds 30]

The bucket, knowledge base and data source ids are outputs of the
RagKnowledgeBaseStack<env> stack.`;

// StartIngestionJob is limited to 0.1 requests per second and one concurrent job
// per data source, so the CLI waits before starting each job.
const JOB_START_DELAY_SECONDS = 15;
const DEFAULT_POLL_INTERVAL_SECONDS = 30;

const TERMINAL_STATUSES = ['COMPLETE', 'FAILED', 'STOPPED'];

const sleep = (seconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, seconds * 1000));

const listExistingKeys = async ({
  s3,
  bucket,
  prefix,
}: {
  s3: S3Client;
  bucket: string;
  prefix: string;
}): Promise<string[]> => {
  const keys: string[] = [];
  let continuationToken: string | undefined = undefined;

  do {
    const response: ListObjectsV2CommandOutput = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );
    keys.push(
      ...(response.Contents ?? [])
        .map((object) => object.Key)
        .filter((key): key is string => key !== undefined)
    );
    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return keys;
};

// The sidecar has to exist before the PDF is ingested, otherwise the chunks are
// stored without any metadata.
const uploadPart = async ({
  s3,
  bucket,
  prefix,
  partsDir,
  part,
}: {
  s3: S3Client;
  bucket: string;
  prefix: string;
  partsDir: string;
  part: PartArtifact;
}): Promise<void> => {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKeyFor(prefix, part.sidecarFileName),
      Body: await readFile(join(partsDir, part.sidecarFileName)),
      ContentType: 'application/json',
    })
  );
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKeyFor(prefix, part.fileName),
      Body: await readFile(join(partsDir, part.fileName)),
      ContentType: 'application/pdf',
    })
  );
};

const runIngestionJob = async ({
  bedrockAgent,
  knowledgeBaseId,
  dataSourceId,
  description,
  pollIntervalSeconds,
}: {
  bedrockAgent: BedrockAgentClient;
  knowledgeBaseId: string;
  dataSourceId: string;
  description: string;
  pollIntervalSeconds: number;
}): Promise<void> => {
  await sleep(JOB_START_DELAY_SECONDS);

  const started = await bedrockAgent.send(
    new StartIngestionJobCommand({
      knowledgeBaseId,
      dataSourceId,
      description,
    })
  );
  const ingestionJobId = started.ingestionJob?.ingestionJobId;
  if (!ingestionJobId) {
    throw new Error('StartIngestionJob did not return an ingestion job id');
  }

  console.log(`  ingestion job ${ingestionJobId} started`);

  for (;;) {
    await sleep(pollIntervalSeconds);

    const current = await bedrockAgent.send(
      new GetIngestionJobCommand({
        knowledgeBaseId,
        dataSourceId,
        ingestionJobId,
      })
    );
    const job = current.ingestionJob;
    const status = job?.status ?? 'UNKNOWN';

    if (!TERMINAL_STATUSES.includes(status)) {
      console.log(`  ingestion job ${ingestionJobId} is ${status}`);
      continue;
    }

    const statistics = job?.statistics;
    const failedCount = statistics?.numberOfDocumentsFailed ?? 0;
    const indexedCount =
      (statistics?.numberOfNewDocumentsIndexed ?? 0) +
      (statistics?.numberOfModifiedDocumentsIndexed ?? 0);
    const failureReasons = job?.failureReasons ?? [];

    if (status !== 'COMPLETE' || failedCount > 0) {
      throw new Error(
        `Ingestion job ${ingestionJobId} finished as ${status} with ${failedCount} failed document(s). ` +
          `Reasons: ${(failureReasons.length > 0 ? failureReasons : ['(none reported)']).join('; ')}`
      );
    }

    // A document whose sidecar exceeds the service limit is skipped without
    // being counted as a failed document. The job still reports COMPLETE, so
    // the failure is only visible in failureReasons and in an indexed count of
    // zero. Treat both as errors, otherwise a run reports success while
    // nothing reached the knowledge base.
    if (failureReasons.length > 0) {
      throw new Error(
        `Ingestion job ${ingestionJobId} completed but reported: ${failureReasons.join('; ')}`
      );
    }
    if (indexedCount === 0) {
      throw new Error(
        `Ingestion job ${ingestionJobId} completed without indexing any document. ` +
          `Scanned ${statistics?.numberOfDocumentsScanned ?? 0} document(s) and ` +
          `${statistics?.numberOfMetadataDocumentsScanned ?? 0} metadata file(s)`
      );
    }

    console.log(
      `  ingestion job ${ingestionJobId} completed (indexed ${statistics?.numberOfNewDocumentsIndexed ?? 0}, ` +
        `modified ${statistics?.numberOfModifiedDocumentsIndexed ?? 0})`
    );
    return;
  }
};

const main = async (): Promise<void> => {
  const args = parseArgs(process.argv.slice(2));
  const partsPath = requireArg(args, 'parts');
  const bucket = requireArg(args, 'bucket');
  const prefix = requireArg(args, 'prefix');
  const knowledgeBaseId = requireArg(args, 'knowledge-base-id');
  const dataSourceId = requireArg(args, 'data-source-id');
  const region =
    args.region && args.region !== 'true' ? args.region : undefined;
  const pollIntervalSeconds =
    optionalNumberArg(args, 'poll-interval-seconds') ??
    DEFAULT_POLL_INTERVAL_SECONDS;

  const partsManifest = JSON.parse(
    await readFile(partsPath, 'utf8')
  ) as PartsManifestFile;
  const partsDir = dirname(partsPath);
  const targets = selectPartsToIngest(
    partsManifest.parts,
    optionalNumberArg(args, 'start-from') ?? 1
  );

  const s3 = new S3Client({ region });
  const bedrockAgent = new BedrockAgentClient({ region });

  const staleKeys = findStaleObjectKeys({
    existingKeys: await listExistingKeys({ s3, bucket, prefix }),
    expectedKeys: partsManifest.parts.flatMap((part) => [
      objectKeyFor(prefix, part.fileName),
      objectKeyFor(prefix, part.sidecarFileName),
    ]),
  });
  if (staleKeys.length > 0) {
    console.warn(
      `Warning: the prefix already holds objects that this split does not own. ` +
        `Delete them first to avoid indexing the same pages twice:\n- ${staleKeys.join('\n- ')}`
    );
  }

  // Upload the integrated (pre-split) document to originals/ so citations can
  // link to it. It lives outside the data source inclusion prefix (docs/), so it
  // is served but never parsed, and needs no ingestion job. Uploaded once and
  // idempotent, so it is present even on a --start-from resume.
  if (partsManifest.integratedFileName) {
    const integratedKey = `${INTEGRATED_DOCUMENT_PREFIX}${partsManifest.originalFileName}`;
    console.log(`integrated document: uploading ${integratedKey}`);
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: integratedKey,
        Body: await readFile(join(partsDir, partsManifest.integratedFileName)),
        ContentType: 'application/pdf',
      })
    );
  }

  for (const part of targets) {
    console.log(
      `part ${part.partNumber} (pages ${part.startPage}-${part.endPage}): uploading ${part.fileName}`
    );
    await uploadPart({ s3, bucket, prefix, partsDir, part });

    await runIngestionJob({
      bedrockAgent,
      knowledgeBaseId,
      dataSourceId,
      description: `${partsManifest.documentId} part ${part.partNumber}`,
      pollIntervalSeconds,
    });
  }

  console.log(
    `Ingested ${targets.length} part(s) of ${partsManifest.documentId}`
  );
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  console.error(`\n${USAGE}`);
  process.exitCode = 1;
});
