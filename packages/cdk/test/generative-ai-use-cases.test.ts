import { Match, Template } from 'aws-cdk-lib/assertions';
import * as cdk from 'aws-cdk-lib';
import {
  processedStackInputSchema,
  stackInputSchema,
  StackInput,
} from '../lib/stack-input';
import { createStacks } from '../lib/create-stacks';
import {
  BUNDLING_STACKS,
  DISABLE_ASSET_STAGING_CONTEXT,
} from 'aws-cdk-lib/cx-api';

const appContext = {
  [BUNDLING_STACKS]: [],
  [DISABLE_ASSET_STAGING_CONTEXT]: true,
};

describe('GenerativeAiUseCases', () => {
  const stackInput: Partial<StackInput> = {
    account: '123456890123',
    region: 'us-east-1',
    env: '',
    ragEnabled: true,
    kendraIndexArn: null,
    kendraDataSourceBucketName: null,
    kendraIndexScheduleEnabled: false,
    kendraIndexScheduleCreateCron: null,
    kendraIndexScheduleDeleteCron: null,
    ragKnowledgeBaseEnabled: true,
    ragKnowledgeBaseStandbyReplicas: false,
    ragKnowledgeBaseAdvancedParsing: false,
    ragKnowledgeBaseAdvancedParsingModelId:
      'anthropic.claude-3-sonnet-20240229-v1:0',
    embeddingModelId: 'amazon.titan-embed-text-v2:0',
    selfSignUpEnabled: true,
    allowedSignUpEmailDomains: null,
    samlAuthEnabled: false,
    samlCognitoDomainName: '',
    samlCognitoFederatedIdentityProviderName: '',
    modelRegion: 'us-east-1',
    modelIds: [
      {
        modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
        region: 'us-east-1',
      },
    ],
    imageGenerationModelIds: [
      { modelId: 'stability.stable-diffusion-xl-v1', region: 'us-east-1' },
    ],
    videoGenerationModelIds: [
      { modelId: 'amazon.nova-reel-v1:0', region: 'us-east-1' },
    ],
    speechToSpeechModelIds: [
      { modelId: 'amazon.nova-sonic-v1:0', region: 'us-east-1' },
    ],
    endpointNames: [],
    agentEnabled: true,
    searchAgentEnabled: true,
    searchEngine: 'Brave',
    searchApiKey: 'XXXXXX',
    agents: [],
    flows: [],
    createGenericAgentCoreRuntime: true,
    agentBuilderEnabled: true,
    agentCoreRegion: 'us-east-1',
    agentCoreExternalRuntimes: [],
    allowedIpV4AddressRanges: null,
    allowedIpV6AddressRanges: null,
    allowedCountryCodes: ['JP'],
    hostName: null,
    domainName: null,
    hostedZoneId: null,
    dashboard: true,
    anonymousUsageTracking: true,
    guardrailEnabled: true,
    crossAccountBedrockRoleArn: '',
    useCaseBuilderEnabled: true,
    tagKey: null,
    tagValue: null,
  };

  test('matches the snapshot', () => {
    const app = new cdk.App({
      context: appContext,
    });

    const params = processedStackInputSchema.parse(stackInput);

    const {
      cloudFrontWafStack,
      ragKnowledgeBaseStack,
      agentStack,
      agentCoreStack,
      guardrailStack,
      generativeAiUseCasesStack,
      dashboardStack,
    } = createStacks(app, params);

    // Create Templates
    if (
      !cloudFrontWafStack ||
      !ragKnowledgeBaseStack ||
      !agentStack ||
      !agentCoreStack ||
      !guardrailStack ||
      !generativeAiUseCasesStack ||
      !dashboardStack
    ) {
      throw new Error('Not all stacks are created');
    }
    const cloudFrontWafTemplate = Template.fromStack(cloudFrontWafStack);
    const ragKnowledgeBaseTemplate = Template.fromStack(ragKnowledgeBaseStack);
    const agentTemplate = Template.fromStack(agentStack);
    const agentCoreTemplate = Template.fromStack(agentCoreStack);
    const guardrailTemplate = Template.fromStack(guardrailStack);
    const generativeAiUseCasesTemplate = Template.fromStack(
      generativeAiUseCasesStack
    );
    const dashboardTemplate = Template.fromStack(dashboardStack);

    // Assert
    expect(cloudFrontWafTemplate.toJSON()).toMatchSnapshot();
    expect(ragKnowledgeBaseTemplate.toJSON()).toMatchSnapshot();
    expect(agentTemplate.toJSON()).toMatchSnapshot();
    expect(agentCoreTemplate.toJSON()).toMatchSnapshot();
    expect(guardrailTemplate.toJSON()).toMatchSnapshot();
    expect(generativeAiUseCasesTemplate.toJSON()).toMatchSnapshot();
    expect(dashboardTemplate.toJSON()).toMatchSnapshot();
  });

  test('matches the snapshot (closed network mode)', () => {
    const app = new cdk.App({
      context: appContext,
    });

    const params = processedStackInputSchema.parse({
      ...stackInput,
      closedNetworkMode: true,
    });

    const {
      closedNetworkStack,
      ragKnowledgeBaseStack,
      agentStack,
      agentCoreStack,
      guardrailStack,
      generativeAiUseCasesStack,
      dashboardStack,
    } = createStacks(app, params);

    // Create Templates
    if (
      !closedNetworkStack ||
      !ragKnowledgeBaseStack ||
      !agentStack ||
      !agentCoreStack ||
      !guardrailStack ||
      !generativeAiUseCasesStack ||
      !dashboardStack
    ) {
      throw new Error('Not all stacks are created');
    }
    const closedNetworkTemplate = Template.fromStack(closedNetworkStack);
    const ragKnowledgeBaseTemplate = Template.fromStack(ragKnowledgeBaseStack);
    const agentTemplate = Template.fromStack(agentStack);
    const agentCoreTemplate = Template.fromStack(agentCoreStack);
    const guardrailTemplate = Template.fromStack(guardrailStack);
    const generativeAiUseCasesTemplate = Template.fromStack(
      generativeAiUseCasesStack
    );
    const dashboardTemplate = Template.fromStack(dashboardStack);

    // Assert
    expect(closedNetworkTemplate.toJSON()).toMatchSnapshot();
    expect(ragKnowledgeBaseTemplate.toJSON()).toMatchSnapshot();
    expect(agentTemplate.toJSON()).toMatchSnapshot();
    expect(agentCoreTemplate.toJSON()).toMatchSnapshot();
    expect(guardrailTemplate.toJSON()).toMatchSnapshot();
    expect(generativeAiUseCasesTemplate.toJSON()).toMatchSnapshot();
    expect(dashboardTemplate.toJSON()).toMatchSnapshot();
  });

  test('tagKey functionality', () => {
    // Test with custom tagKey
    const appWithCustomTag = new cdk.App({
      context: appContext,
    });
    const paramsWithCustomTag = processedStackInputSchema.parse({
      ...stackInput,
      tagKey: 'CustomTag',
      tagValue: 'custom-value',
    });

    const stacksWithCustomTag = createStacks(
      appWithCustomTag,
      paramsWithCustomTag
    );

    // Test without tagKey (should use default)
    const appWithoutTagKey = new cdk.App({
      context: appContext,
    });
    const paramsWithoutTagKey = processedStackInputSchema.parse({
      ...stackInput,
      tagKey: null,
      tagValue: 'default-value',
    });

    const stacksWithoutTagKey = createStacks(
      appWithoutTagKey,
      paramsWithoutTagKey
    );

    // Assert that both scenarios create stacks successfully
    expect(stacksWithCustomTag.generativeAiUseCasesStack).toBeDefined();
    expect(stacksWithoutTagKey.generativeAiUseCasesStack).toBeDefined();

    // Test that RagKnowledgeBaseStack is created properly with custom tagKey
    if (stacksWithCustomTag.ragKnowledgeBaseStack) {
      const customTagTemplate = Template.fromStack(
        stacksWithCustomTag.ragKnowledgeBaseStack
      );
      // Check that custom resource uses the custom tag key
      customTagTemplate.hasResourceProperties('Custom::ApplyTags', {
        tag: {
          key: 'CustomTag',
          value: 'custom-value',
        },
      });
    }
  });

  test('matches the snapshot (AgentCore with VPC)', () => {
    const app = new cdk.App();

    // Simulate parameter.ts computed: isAgentCoreNetworkPrivate is derived
    // from VPC/Subnet being both provided. Do not set it manually here.
    const vpcInput = {
      ...stackInput,
      agentCoreVpcId: 'vpc-12345678',
      agentCoreSubnetIds: ['subnet-12345678', 'subnet-87654321'],
    };
    const params = processedStackInputSchema.parse({
      ...vpcInput,
      isAgentCoreNetworkPrivate: !!(
        vpcInput.agentCoreVpcId &&
        vpcInput.agentCoreSubnetIds &&
        vpcInput.agentCoreSubnetIds.length > 0
      ),
    });

    const {
      cloudFrontWafStack,
      ragKnowledgeBaseStack,
      agentStack,
      agentCoreStack,
      guardrailStack,
      generativeAiUseCasesStack,
      dashboardStack,
    } = createStacks(app, params);

    // Create Templates
    if (
      !cloudFrontWafStack ||
      !ragKnowledgeBaseStack ||
      !agentStack ||
      !agentCoreStack ||
      !guardrailStack ||
      !generativeAiUseCasesStack ||
      !dashboardStack
    ) {
      throw new Error('Not all stacks are created');
    }
    const agentCoreTemplate = Template.fromStack(agentCoreStack);

    // Assert
    expect(agentCoreTemplate.toJSON()).toMatchSnapshot();
  });

  test('AgentCore VPC config requires both vpcId and subnetIds', () => {
    // Only vpcId is provided -> must fail
    expect(() =>
      stackInputSchema.parse({
        ...stackInput,
        agentCoreVpcId: 'vpc-12345678',
        agentCoreSubnetIds: null,
      })
    ).toThrow();

    // Only subnetIds is provided -> must fail
    expect(() =>
      stackInputSchema.parse({
        ...stackInput,
        agentCoreVpcId: null,
        agentCoreSubnetIds: ['subnet-12345678'],
      })
    ).toThrow();

    // Both provided -> must pass
    expect(() =>
      stackInputSchema.parse({
        ...stackInput,
        agentCoreVpcId: 'vpc-12345678',
        agentCoreSubnetIds: ['subnet-12345678'],
      })
    ).not.toThrow();

    // Neither provided -> must pass (PUBLIC mode)
    expect(() =>
      stackInputSchema.parse({
        ...stackInput,
        agentCoreVpcId: null,
        agentCoreSubnetIds: null,
      })
    ).not.toThrow();
  });

  test('Knowledge Base settings keep backward-compatible defaults', () => {
    const params = stackInputSchema.parse({});

    expect(params.ragKnowledgeBaseVectorStoreType).toBe(
      'OPENSEARCH_SERVERLESS'
    );
    expect(params.ragKnowledgeBaseSearchType).toBe('HYBRID');
    expect(params.ragKnowledgeBaseDeployDefaultDocuments).toBe(true);
    expect(() =>
      stackInputSchema.parse({
        ragKnowledgeBaseVectorStoreType: 'S3_VECTORS',
        ragKnowledgeBaseSearchType: 'HYBRID',
      })
    ).toThrow('S3 Vectors requires ragKnowledgeBaseSearchType SEMANTIC');
  });

  test('creates an S3 Vectors Knowledge Base with advanced PDF parsing', () => {
    const app = new cdk.App({ context: appContext });
    const params = processedStackInputSchema.parse({
      ...stackInput,
      ragKnowledgeBaseVectorStoreType: 'S3_VECTORS',
      ragKnowledgeBaseSearchType: 'SEMANTIC',
      ragKnowledgeBaseDeployDefaultDocuments: false,
      ragKnowledgeBaseAdvancedParsing: true,
      ragKnowledgeBaseAdvancedParsingModelId:
        'jp.anthropic.claude-haiku-4-5-20251001-v1:0',
      account: '123456890123',
      region: 'ap-northeast-1',
      modelRegion: 'ap-northeast-1',
      agentEnabled: false,
      searchAgentEnabled: false,
      agentBuilderEnabled: false,
      createGenericAgentCoreRuntime: false,
      guardrailEnabled: false,
      dashboard: false,
      allowedCountryCodes: null,
    });

    const { ragKnowledgeBaseStack, generativeAiUseCasesStack } = createStacks(
      app,
      params
    );
    if (!ragKnowledgeBaseStack) {
      throw new Error('RagKnowledgeBaseStack was not created');
    }

    const ragTemplate = Template.fromStack(ragKnowledgeBaseStack);
    ragTemplate.resourceCountIs('AWS::S3Vectors::VectorBucket', 1);
    ragTemplate.resourceCountIs('AWS::S3Vectors::Index', 1);
    ragTemplate.resourceCountIs('AWS::OpenSearchServerless::Collection', 0);
    ragTemplate.resourceCountIs('AWS::Bedrock::DataSource', 1);
    ragTemplate.resourceCountIs('Custom::CDKBucketDeployment', 0);
    ragTemplate.hasResourceProperties('AWS::S3Vectors::Index', {
      DataType: 'float32',
      Dimension: 1024,
      DistanceMetric: 'cosine',
      MetadataConfiguration: {
        NonFilterableMetadataKeys: [
          'AMAZON_BEDROCK_TEXT',
          'AMAZON_BEDROCK_METADATA',
        ],
      },
    });
    ragTemplate.hasResourceProperties('AWS::Bedrock::KnowledgeBase', {
      StorageConfiguration: {
        Type: 'S3_VECTORS',
        S3VectorsConfiguration: {
          IndexArn: Match.anyValue(),
        },
      },
    });
    ragTemplate.hasResourceProperties('AWS::Bedrock::DataSource', {
      Name: Match.stringLikeRegexp('^s3-data-source-[0-9a-f]{8}$'),
      DataSourceConfiguration: {
        Type: 'S3',
        S3Configuration: {
          InclusionPrefixes: ['docs/'],
        },
      },
      VectorIngestionConfiguration: {
        ChunkingConfiguration: {
          ChunkingStrategy: 'FIXED_SIZE',
          FixedSizeChunkingConfiguration: {
            MaxTokens: 1500,
            OverlapPercentage: 20,
          },
        },
        ParsingConfiguration: {
          ParsingStrategy: 'BEDROCK_FOUNDATION_MODEL',
          BedrockFoundationModelConfiguration: {
            ModelArn:
              'arn:aws:bedrock:ap-northeast-1:123456890123:inference-profile/jp.anthropic.claude-haiku-4-5-20251001-v1:0',
            ParsingPrompt: {
              ParsingPromptText: Match.stringLikeRegexp('Markdown'),
            },
          },
        },
      },
    });
    ragTemplate.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: [
              's3vectors:PutVectors',
              's3vectors:GetVectors',
              's3vectors:DeleteVectors',
              's3vectors:QueryVectors',
              's3vectors:GetIndex',
            ],
            Effect: 'Allow',
          }),
          Match.objectLike({
            Action: ['bedrock:GetInferenceProfile', 'bedrock:InvokeModel'],
            Effect: 'Allow',
            Resource:
              'arn:aws:bedrock:ap-northeast-1:123456890123:inference-profile/jp.anthropic.claude-haiku-4-5-20251001-v1:0',
          }),
          Match.objectLike({
            Action: 'bedrock:InvokeModel',
            Effect: 'Allow',
            Resource: [
              'arn:aws:bedrock:ap-northeast-1::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0',
              'arn:aws:bedrock:ap-northeast-3::foundation-model/anthropic.claude-haiku-4-5-20251001-v1:0',
            ],
            Condition: {
              StringEquals: {
                'bedrock:InferenceProfileArn':
                  'arn:aws:bedrock:ap-northeast-1:123456890123:inference-profile/jp.anthropic.claude-haiku-4-5-20251001-v1:0',
              },
            },
          }),
        ]),
      },
    });
    expect(ragTemplate.toJSON().Resources.KnowledgeBase.DependsOn).toContain(
      'KnowledgeBasePolicyC27E5132'
    );

    const appTemplate = Template.fromStack(generativeAiUseCasesStack);
    appTemplate.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({
          KNOWLEDGE_BASE_SEARCH_TYPE: 'SEMANTIC',
        }),
      },
    });
  });
});
