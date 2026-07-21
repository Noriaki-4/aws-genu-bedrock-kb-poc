import * as lambda from 'aws-lambda';
import { RetrieveCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { RetrieveKnowledgeBaseRequest } from 'generative-ai-use-cases';
import { initBedrockAgentRuntimeClient } from './utils/bedrockClient';
import {
  flushLangfuse,
  getLangfuseTraceFromEvent,
  truncateForLangfuse,
} from './utils/langfuse';

const KNOWLEDGE_BASE_ID = process.env.KNOWLEDGE_BASE_ID;
const MODEL_REGION = process.env.MODEL_REGION as string;
const KNOWLEDGE_BASE_SEARCH_TYPE = (process.env.KNOWLEDGE_BASE_SEARCH_TYPE ??
  'HYBRID') as 'HYBRID' | 'SEMANTIC';

export const handler = async (
  event: lambda.APIGatewayProxyEvent
): Promise<lambda.APIGatewayProxyResult> => {
  const req = JSON.parse(event.body!) as RetrieveKnowledgeBaseRequest;
  const query = req.query;

  if (!query) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({ error: 'query is not specified' }),
    };
  }

  const client = await initBedrockAgentRuntimeClient({ region: MODEL_REGION });
  const retrieveCommand = new RetrieveCommand({
    knowledgeBaseId: KNOWLEDGE_BASE_ID,
    retrievalQuery: { text: query },
    retrievalConfiguration: {
      vectorSearchConfiguration: {
        numberOfResults: 10,
        overrideSearchType: KNOWLEDGE_BASE_SEARCH_TYPE,
      },
    },
  });
  const trace = getLangfuseTraceFromEvent(event);
  trace?.update({
    sessionId: req.id,
    input: { query },
    metadata: {
      provider: 'bedrock-knowledge-base',
      operation: 'retrieve',
      knowledgeBaseId: KNOWLEDGE_BASE_ID,
    },
    tags: ['rag', 'retrieval'],
  });
  const span = trace?.span({
    name: 'knowledge-base retrieve',
    input: { query },
    metadata: {
      provider: 'bedrock-knowledge-base',
      operation: 'retrieve',
      knowledgeBaseId: KNOWLEDGE_BASE_ID,
    },
  });

  try {
    const retrieveRes = await client.send(retrieveCommand);
    span?.end({
      output: {
        resultCount: retrieveRes.retrievalResults?.length ?? 0,
        results: retrieveRes.retrievalResults?.slice(0, 10).map((item) => ({
          score: item.score,
          location: item.location,
          content: truncateForLangfuse(item.content?.text, 1000),
          metadata: item.metadata,
        })),
      },
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(retrieveRes),
    };
  } catch (error) {
    span?.end({
      level: 'ERROR',
      statusMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    await flushLangfuse();
  }
};
