import * as lambda from 'aws-lambda';
import {
  AttributeFilter,
  KendraClient,
  QueryCommand,
} from '@aws-sdk/client-kendra';
import { QueryKendraRequest } from 'generative-ai-use-cases';
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
  const req = JSON.parse(event.body!) as QueryKendraRequest;
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
  const queryCommand = new QueryCommand({
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
      operation: 'query',
      indexId: INDEX_ID,
    },
    tags: ['rag', 'retrieval'],
  });
  const span = trace?.span({
    name: 'kendra query',
    input: { query },
    metadata: {
      provider: 'kendra',
      operation: 'query',
      indexId: INDEX_ID,
    },
  });

  try {
    const queryRes = await kendra.send(queryCommand);
    span?.end({
      output: {
        totalNumberOfResults: queryRes.TotalNumberOfResults,
        resultCount: queryRes.ResultItems?.length ?? 0,
        results: queryRes.ResultItems?.slice(0, 10).map((item) => ({
          id: item.Id,
          type: item.Type,
          title: truncateForLangfuse(item.DocumentTitle?.Text, 500),
          uri: item.DocumentURI,
          excerpt: truncateForLangfuse(item.DocumentExcerpt?.Text, 1000),
        })),
      },
    });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify(queryRes),
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
