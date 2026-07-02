import * as lambda from 'aws-lambda';
import {
  AttributeFilter,
  KendraClient,
  RetrieveCommand,
} from '@aws-sdk/client-kendra';
import { RetrieveKendraRequest } from 'generative-ai-use-cases';
import {
  flushLangfuse,
  getLangfuseTraceFromEvent,
  truncateForLangfuse,
} from './utils/langfuse';

const INDEX_ID = process.env.INDEX_ID;
const LANGUAGE = process.env.LANGUAGE;

export const handler = async (
  event: lambda.APIGatewayProxyEvent
): Promise<lambda.APIGatewayProxyResult> => {
  const req = JSON.parse(event.body!) as RetrieveKendraRequest;
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

  // The default language is English, so language settings must be done.
  const attributeFilter: AttributeFilter = {
    AndAllFilters: [
      {
        EqualsTo: {
          Key: '_language_code',
          Value: {
            StringValue: LANGUAGE,
          },
        },
      },
    ],
  };

  const kendra = new KendraClient({});
  const retrieveCommand = new RetrieveCommand({
    IndexId: INDEX_ID,
    QueryText: query,
    AttributeFilter: attributeFilter,
  });
  const trace = getLangfuseTraceFromEvent(event);
  trace?.update({
    sessionId: req.id,
    input: { query },
    metadata: {
      provider: 'kendra',
      operation: 'retrieve',
      indexId: INDEX_ID,
    },
    tags: ['rag', 'retrieval'],
  });
  const span = trace?.span({
    name: 'kendra retrieve',
    input: { query },
    metadata: {
      provider: 'kendra',
      operation: 'retrieve',
      indexId: INDEX_ID,
    },
  });

  try {
    const retrieveRes = await kendra.send(retrieveCommand);
    span?.end({
      output: {
        resultCount: retrieveRes.ResultItems?.length ?? 0,
        results: retrieveRes.ResultItems?.slice(0, 10).map((item) => ({
          id: item.Id,
          title: truncateForLangfuse(item.DocumentTitle, 500),
          uri: item.DocumentURI,
          content: truncateForLangfuse(item.Content, 1000),
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
