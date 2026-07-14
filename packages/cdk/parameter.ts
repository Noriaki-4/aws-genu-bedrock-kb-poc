import * as cdk from 'aws-cdk-lib';
import {
  StackInput,
  stackInputSchema,
  ProcessedStackInput,
} from './lib/stack-input';
import { ModelConfiguration } from 'generative-ai-use-cases';
import { loadBrandingConfig } from './branding';

// Get parameters from CDK Context
const getContext = (app: cdk.App): StackInput => {
  const params = stackInputSchema.parse(app.node.getAllContext());
  return params;
};

// If you want to define parameters directly
const envs: Record<string, Partial<StackInput>> = {
  // If you want to define an anonymous environment, uncomment the following and the content of cdk.json will be ignored.
  // If you want to define an anonymous environment in parameter.ts, uncomment the following and the content of cdk.json will be ignored.
  // '': {
  //   // Parameters for anonymous environment
  //   // If you want to override the default settings, add the following
  // },
  dev: {
    // Parameters for development environment

    // Defining an env block makes cdk.json's context ignored, so every value we
    // rely on has to be set here explicitly. The Knowledge Base lives in
    // ap-northeast-1, and the RAG retrieve Lambda queries it in modelRegion,
    // so the two must match (the schema default is us-east-1).
    modelRegion: 'ap-northeast-1',

    // Reuse an existing Bedrock Knowledge Base instead of letting GenU create one.
    // Passing ragKnowledgeBaseId skips RagKnowledgeBaseStack, so no OpenSearch
    // Serverless collection is provisioned.
    //
    // This KB is backed by S3 Vectors. It has to be a VECTOR-type KB: a MANAGED
    // (fully managed) KB exposes no vector store, and Bedrock rejects both of the
    // calls GenU makes against it.
    ragKnowledgeBaseEnabled: true,
    ragKnowledgeBaseId: 'HO8P6XRCIE',

    agentCoreRegion: 'ap-northeast-1',

    agentCoreExternalRuntimes: [
      {
        name: 'BedrockAgent_BedrockAgent',
        // eslint-disable-next-line i18nhelper/no-jp-string
        display_name: '別戸六区 英慈円斗',
        // eslint-disable-next-line i18nhelper/no-jp-string
        description: '自分の名前を回答するサンプルエージェントです。',
        arn: 'arn:aws:bedrock-agentcore:ap-northeast-1:035351467732:runtime/BedrockAgent_BedrockAgent-052O95DjiR',
      },
    ],

    agentBuilderEnabled: false,
    createGenericAgentCoreRuntime: false,
  },
  staging: {
    // Parameters for staging environment
  },
  prod: {
    // Parameters for production environment
  },
  // If you need other environments, customize them as needed
};

// For backward compatibility, get parameters from CDK Context > parameter.ts
export const getParams = (app: cdk.App): ProcessedStackInput => {
  // By default, get parameters from CDK Context
  let params = getContext(app);

  // If the env matches the ones defined in envs, use the parameters in envs instead of the ones in context
  if (envs[params.env]) {
    params = stackInputSchema.parse({
      ...envs[params.env],
      env: params.env,
    });
  }
  // Make the format of modelIds, imageGenerationModelIds consistent
  const convertToModelConfiguration = (
    models: (string | ModelConfiguration)[],
    defaultRegion: string
  ): ModelConfiguration[] => {
    return models.map((model) =>
      typeof model === 'string'
        ? { modelId: model, region: defaultRegion }
        : model
    );
  };

  return {
    ...params,
    modelIds: convertToModelConfiguration(params.modelIds, params.modelRegion),
    imageGenerationModelIds: convertToModelConfiguration(
      params.imageGenerationModelIds,
      params.modelRegion
    ),
    videoGenerationModelIds: convertToModelConfiguration(
      params.videoGenerationModelIds,
      params.modelRegion
    ),
    speechToSpeechModelIds: convertToModelConfiguration(
      params.speechToSpeechModelIds,
      params.modelRegion
    ),
    endpointNames: convertToModelConfiguration(
      params.endpointNames,
      params.modelRegion
    ),
    // Process agentCoreRegion: null -> modelRegion
    agentCoreRegion: params.agentCoreRegion || params.modelRegion,
    // Compute isAgentCoreNetworkPrivate from VPC configuration
    isAgentCoreNetworkPrivate: !!(
      params.agentCoreVpcId &&
      params.agentCoreSubnetIds &&
      params.agentCoreSubnetIds.length > 0
    ),
    // Load branding configuration
    brandingConfig: loadBrandingConfig(),
  };
};
