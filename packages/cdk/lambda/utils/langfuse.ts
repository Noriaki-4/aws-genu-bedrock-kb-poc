import { Langfuse } from 'langfuse';
import type { LangfuseTraceClient } from 'langfuse';
import type { Metadata, UnrecordedMessage } from 'generative-ai-use-cases';

const MAX_TEXT_LENGTH = 8000;

export const langfuse: Langfuse | null =
  process.env.LANGFUSE_ENABLED === 'true'
    ? new Langfuse({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        baseUrl: process.env.LANGFUSE_HOST,
      })
    : null;

export const truncateForLangfuse = (
  value: string | undefined,
  maxLength = MAX_TEXT_LENGTH
): string | undefined => {
  if (!value || value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}... [truncated ${value.length - maxLength} chars]`;
};

export const sanitizeMessagesForLangfuse = (
  messages: UnrecordedMessage[]
): unknown[] =>
  messages.map((message) => ({
    role: message.role,
    content: truncateForLangfuse(message.content),
    trace: truncateForLangfuse(message.trace),
    llmType: message.llmType,
    metadata: message.metadata,
    extraData: message.extraData?.map((data) => ({
      type: data.type,
      name: data.name,
      sourceType: data.source.type,
      mediaType: data.source.mediaType,
      dataLength: data.source.data.length,
    })),
  }));

export const usageDetailsForLangfuse = (
  usage?: Metadata['usage']
): Record<string, number> | undefined => {
  if (!usage) {
    return undefined;
  }

  return {
    input: usage.inputTokens,
    output: usage.outputTokens,
    total: usage.totalTokens,
    ...(usage.cacheReadInputTokens
      ? { cache_read_input: usage.cacheReadInputTokens }
      : {}),
    ...(usage.cacheWriteInputTokens
      ? { cache_write_input: usage.cacheWriteInputTokens }
      : {}),
  };
};

export const modelParametersForLangfuse = (
  parameters?: Record<string, unknown>
): Record<string, string | number | boolean | string[] | null> | undefined => {
  if (!parameters) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(parameters).map(([key, value]) => {
      if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        return [key, value];
      }
      if (Array.isArray(value) && value.every((v) => typeof v === 'string')) {
        return [key, value];
      }
      return [key, JSON.stringify(value)];
    })
  );
};

export const getLangfuseTraceFromEvent = (
  event: unknown
): LangfuseTraceClient | undefined =>
  (event as { langfuseTrace?: LangfuseTraceClient }).langfuseTrace;

export const flushLangfuse = async (): Promise<void> => {
  if (!langfuse) {
    return;
  }

  await langfuse.flushAsync().catch((error) => {
    console.error('Failed to flush Langfuse events:', error);
  });
};
