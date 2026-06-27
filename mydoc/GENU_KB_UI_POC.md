# GenU KB + UI PoC

このリポジトリは、Bedrock Knowledge Bases を UI 付きで試すための GenU ベースの検証環境です。

## 目的

GenU を使って、次の2つをまとめて作成します。

```text
Knowledge Base
RAG チャット UI
```

低レイヤーの CDK 学習用リポジトリである `aws-bedrock-kb-infra-poc` とは別物です。

## 前提条件

- Node.js 18 以上
- AWS CLI
  - SSO 設定済みであること
  - profile は `rag-poc-admin` を想定
- CDK CLI
  - `npm install -g aws-cdk`
- `ap-northeast-1` で、次の Bedrock モデルアクセスが有効化済みであること
  - `amazon.nova-pro-v1:0`
  - `jp.amazon.nova-2-lite-v1:0`
  - `amazon.nova-micro-v1:0`
  - `amazon.titan-embed-text-v2:0`

## セットアップ

### 1. GenU をクローンする

```bash
git clone https://github.com/aws-samples/generative-ai-use-cases.git aws-genu-bedrock-kb-poc
cd aws-genu-bedrock-kb-poc
```

### 2. 依存関係をインストールする

```bash
npm ci
```

### 3. cdk.json を設定する

`packages/cdk/cdk.json` を編集し、`context` ブロックに次の値を設定します。

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

`ragKnowledgeBaseId: null` は、GenU 側で Knowledge Base と OpenSearch Serverless リソースを新規作成するという意味です。

## デプロイ

### 1. ログインして AWS アカウントを確認する

```bash
aws sso login --profile rag-poc-admin
aws sts get-caller-identity --profile rag-poc-admin
```

### 2. Bootstrap する（初回のみ）

```bash
npx cdk bootstrap aws://035351467732/ap-northeast-1 --profile rag-poc-admin
```

### 3. 差分を確認する

```bash
npm run cdk:diff -- --profile rag-poc-admin
```

### 4. デプロイする

```bash
npm run cdk:deploy -- --profile rag-poc-admin
```

デプロイには 20〜30 分程度かかります。完了すると、`GenerativeAiUseCasesStack` の outputs にチャット UI の URL が `WebUrl` として表示されます。

CLI で URL を取得する場合は次を実行します。

```bash
aws cloudformation describe-stacks \
  --stack-name GenerativeAiUseCasesStack \
  --profile rag-poc-admin \
  --query "Stacks[0].Outputs[?OutputKey=='WebUrl'].OutputValue" \
  --output text
```

### 5. ドキュメントを S3 にアップロードする

S3 バケット名を取得します。

```bash
aws cloudformation describe-stacks \
  --stack-name RagKnowledgeBaseStack \
  --profile rag-poc-admin \
  --query "Stacks[0].Outputs[?contains(OutputKey,'Bucket')].OutputValue" \
  --output text
```

リポジトリに含まれているサンプルドキュメントをアップロードします。

```bash
aws s3 cp packages/cdk/rag-docs/docs/ s3://<BUCKET_NAME>/ --recursive --profile rag-poc-admin
```

### 6. Knowledge Base を同期する

Knowledge Base ID と Data Source ID を取得します。

```bash
aws bedrock-agent list-knowledge-bases \
  --region ap-northeast-1 --profile rag-poc-admin \
  --query "knowledgeBaseSummaries[].{ID:knowledgeBaseId,Name:name}" --output table

aws bedrock-agent list-data-sources \
  --knowledge-base-id <KB_ID> \
  --region ap-northeast-1 --profile rag-poc-admin \
  --query "dataSourceSummaries[?name=='s3-data-source'].{ID:dataSourceId}" --output table
```

同期を開始します。

```bash
aws bedrock-agent start-ingestion-job \
  --knowledge-base-id <KB_ID> \
  --data-source-id <DS_ID> \
  --region ap-northeast-1 --profile rag-poc-admin \
  --query "ingestionJob.{Status:status,JobId:ingestionJobId}" --output table
```

同期ステータスを確認します。

```bash
aws bedrock-agent get-ingestion-job \
  --knowledge-base-id <KB_ID> \
  --data-source-id <DS_ID> \
  --ingestion-job-id <JOB_ID> \
  --region ap-northeast-1 --profile rag-poc-admin \
  --query "ingestionJob.status" --output text
```

### 7. RAG を確認する

1. 手順4で取得したチャット UI URL を開く
2. サインアップまたはサインインする
   - 確認メールが届かない場合は迷惑メールフォルダも確認する
3. 左メニューから **RAG チャット** を選択する
4. アップロードしたドキュメントに関する質問を投げる
   - `Amazon Bedrock とは何ですか？`
   - `Knowledge Base の仕組みを説明してください。`
5. 回答にドキュメント由来の引用元が含まれていることを確認する

## 削除

```bash
npm run cdk:destroy -- --profile rag-poc-admin
```

`aws-bedrock-kb-infra-poc` 側のスタックと混同しないように注意してください。

## 付録: ワンクリックデプロイ（代替手段）

[AWS Generative AI Solution Box](https://aws-samples.github.io/sample-one-click-generative-ai-solutions/solutions/generative-ai-use-cases/) を使うと、AWS コンソールから CDK なしでデプロイできます。

手順:

1. Solution Box サイトを開き、リージョンに東京を選択する
2. **Deploy** をクリックする
   - AWS コンソールの CloudFormation 画面にリダイレクトされる
3. パラメータを設定する
   - `RAGEnabled=true`
   - `RAGSource=Knowledge-Bases`
4. スタックを作成する
   - 完了まで約20分
5. スタック outputs から Amplify URL にアクセスする

作成されるスタック:

- `GenUDeploymentStack`
- `GenerativeAiUseCasesStack`

**注意:** CDK パスに比べると、モデル選択などの細かい設定には制限があります。短時間の評価用途として使うのがよいです。
