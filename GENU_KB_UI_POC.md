# GenU KB + UI PoC

This repo is the GenU-based path for trying Bedrock Knowledge Bases with a UI.

## Purpose

Use GenU to create both:

```text
Knowledge Base
RAG Chat UI
```

This is separate from `aws-bedrock-kb-infra-poc`, which is the lower-level CDK learning repo.

## Prerequisites

- Node.js >= 18
- AWS CLI (with SSO configured — see profile `rag-poc-admin`)
- CDK CLI: `npm install -g aws-cdk`
- Bedrock model access enabled in `ap-northeast-1` for:
  - `amazon.nova-pro-v1:0`
  - `jp.amazon.nova-2-lite-v1:0`
  - `amazon.nova-micro-v1:0`
  - `amazon.titan-embed-text-v2:0`

## Setup

### 1. Clone GenU

```bash
git clone https://github.com/aws-samples/generative-ai-use-cases.git aws-genu-bedrock-kb-poc
cd aws-genu-bedrock-kb-poc
```

### 2. Install dependencies

```bash
npm ci
```

### 3. Configure cdk.json

Edit `packages/cdk/cdk.json` and set the following values in the `context` block:

```json
"modelRegion": "ap-northeast-1",
"ragKnowledgeBaseEnabled": true,
"ragKnowledgeBaseId": null,
"ragKnowledgeBaseStandbyReplicas": false,
"embeddingModelId": "amazon.titan-embed-text-v2:0",
"modelIds": [
  "amazon.nova-pro-v1:0",
  "jp.amazon.nova-2-lite-v1:0",
  "amazon.nova-micro-v1:0"
]
```

`ragKnowledgeBaseId: null` means GenU will create its own Knowledge Base and OpenSearch Serverless resources.

## Deploy

### 1. Login and verify identity

```bash
aws sso login --profile rag-poc-admin
aws sts get-caller-identity --profile rag-poc-admin
```

### 2. Bootstrap (first time only)

```bash
npx cdk bootstrap aws://035351467732/ap-northeast-1 --profile rag-poc-admin
```

### 3. Check the diff

```bash
npm run cdk:diff -- --profile rag-poc-admin
```

### 4. Deploy

```bash
npm run cdk:deploy -- --profile rag-poc-admin
```

Deployment takes about 20-30 minutes. On completion, the Amplify URL for the chat UI is shown in the CloudFormation stack outputs.

### 5. Sync Knowledge Base data source

After deploy, go to AWS Console → Bedrock → Knowledge Bases → select the created KB → Data source → **Sync**.

Sample documents are included in `packages/cdk/rag-docs/docs/`.

## Teardown

```bash
npm run cdk:destroy -- --profile rag-poc-admin
```

Do not mix up with stacks from `aws-bedrock-kb-infra-poc`.

## Appendix: One-Click Deploy (Alternative)

[AWS Generative AI Solution Box](https://aws-samples.github.io/sample-one-click-generative-ai-solutions/solutions/generative-ai-use-cases/) provides a CDK-free deployment option via the AWS Console.

Steps:

1. Open the Solution Box site and select the region (Tokyo)
2. Click **Deploy** → redirected to CloudFormation in the AWS Console
3. Set parameters: `RAGEnabled=true`, `RAGSource=Knowledge-Bases`
4. Create stack → completes in ~20 minutes
5. Access the Amplify URL from the stack outputs

Stacks created: `GenUDeploymentStack`, `GenerativeAiUseCasesStack`

**Note:** Model selection and other fine-grained settings are limited compared to the CDK path. Use this for quick evaluation only.
