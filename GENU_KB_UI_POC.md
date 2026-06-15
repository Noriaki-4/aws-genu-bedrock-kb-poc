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

Deployment takes about 20-30 minutes. On completion, the Chat UI URL is shown in `WebUrl` of the `GenerativeAiUseCasesStack` outputs.

Get the URL via CLI:

```bash
aws cloudformation describe-stacks \
  --stack-name GenerativeAiUseCasesStack \
  --profile rag-poc-admin \
  --query "Stacks[0].Outputs[?OutputKey=='WebUrl'].OutputValue" \
  --output text
```

### 5. Upload documents to S3

Get the S3 bucket name:

```bash
aws cloudformation describe-stacks \
  --stack-name RagKnowledgeBaseStack \
  --profile rag-poc-admin \
  --query "Stacks[0].Outputs[?contains(OutputKey,'Bucket')].OutputValue" \
  --output text
```

Upload sample documents (included in the repo):

```bash
aws s3 cp packages/cdk/rag-docs/docs/ s3://<BUCKET_NAME>/ --recursive --profile rag-poc-admin
```

### 6. Sync Knowledge Base

Get KB ID and Data Source ID:

```bash
aws bedrock-agent list-knowledge-bases \
  --region ap-northeast-1 --profile rag-poc-admin \
  --query "knowledgeBaseSummaries[].{ID:knowledgeBaseId,Name:name}" --output table

aws bedrock-agent list-data-sources \
  --knowledge-base-id <KB_ID> \
  --region ap-northeast-1 --profile rag-poc-admin \
  --query "dataSourceSummaries[?name=='s3-data-source'].{ID:dataSourceId}" --output table
```

Start sync:

```bash
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id <KB_ID> \
  --data-source-id <DS_ID> \
  --region ap-northeast-1 --profile rag-poc-admin \
  --query "ingestionJob.{Status:status,JobId:ingestionJobId}" --output table
```

Check sync status:

```bash
aws bedrock-agent get-ingestion-job \
  --knowledge-base-id <KB_ID> \
  --data-source-id <DS_ID> \
  --ingestion-job-id <JOB_ID> \
  --region ap-northeast-1 --profile rag-poc-admin \
  --query "ingestionJob.status" --output text
```

### 7. Verify RAG

1. Open the Chat UI URL from Step 4
2. Sign up or sign in (check spam folder if verification email is missing)
3. Select **RAG チャット** from the left menu
4. Ask a question about the uploaded documents, e.g.:
   - `Amazon Bedrock とは何ですか？`
   - `Knowledge Base の仕組みを説明してください。`
5. Confirm the response includes source citations from the documents

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
