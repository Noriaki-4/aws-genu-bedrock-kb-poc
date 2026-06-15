# Langfuse Integration Guide

GenU RAG PoC に Langfuse（セルフホスト on AWS）を組み込む手順。

## Phase 1: Langfuse を AWS にデプロイ（Solution Box）

AWS Generative AI Solution Box の Langfuse ソリューションを使う。

1. [Solution Box の Langfuse ページ](https://aws-samples.github.io/sample-one-click-generative-ai-solutions/solutions/langfuse/) を開く
2. リージョン（Tokyo）を選択して Deploy → CloudFormation で作成
3. 完了後、Stack Outputs から以下を取得：
   - `LangfuseUrl`（例: `https://xxxx.cloudfront.net`）
4. Langfuse UI にログインして Project の `Public Key` / `Secret Key` を発行

---

## Phase 2: GenU Lambda に Langfuse SDK を組み込む

### 変更ファイル一覧

| ファイル                                    | 変更内容                                      |
| ------------------------------------------- | --------------------------------------------- |
| `packages/cdk/cdk.json`                     | Langfuse 設定キーを追加                       |
| `packages/cdk/lib/stack-input.ts`           | Zod スキーマに Langfuse フィールドを追加      |
| `packages/cdk/lib/construct/api.ts`         | Lambda 環境変数に Langfuse 設定を渡す         |
| `packages/cdk/lambda/api/index.ts`          | Langfuse SDK 初期化・Express ミドルウェア追加 |
| `packages/cdk/lambda/api/routes/helpers.ts` | `wrapHandler()` にトレース span を追加        |

### 2-1. langfuse パッケージを追加

```bash
cd packages/cdk && npm install langfuse
```

### 2-2. cdk.json に設定を追加

```json
"langfuseEnabled": true,
"langfuseHost": "https://<LangfuseUrl>",
"langfusePublicKey": "<PUBLIC_KEY>",
"langfuseSecretKey": "<SECRET_KEY>"
```

> ⚠️ `langfuseSecretKey` は cdk.json に平文で書かず、SSM Parameter Store に格納して CDK で参照するのが望ましい。

### 2-3. stack-input.ts に Zod スキーマを追加

```typescript
langfuseEnabled: z.boolean().default(false),
langfuseHost: z.string().nullable().default(null),
langfusePublicKey: z.string().nullable().default(null),
langfuseSecretKey: z.string().nullable().default(null),
```

### 2-4. api.ts で Lambda 環境変数に渡す

```typescript
...(params.langfuseEnabled ? {
  LANGFUSE_ENABLED: 'true',
  LANGFUSE_HOST: params.langfuseHost ?? '',
  LANGFUSE_PUBLIC_KEY: params.langfusePublicKey ?? '',
  LANGFUSE_SECRET_KEY: params.langfuseSecretKey ?? '',
} : {}),
```

### 2-5. lambda/api/index.ts で SDK を初期化

```typescript
import Langfuse from 'langfuse';

const langfuse =
  process.env.LANGFUSE_ENABLED === 'true'
    ? new Langfuse({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
        secretKey: process.env.LANGFUSE_SECRET_KEY!,
        baseUrl: process.env.LANGFUSE_HOST,
      })
    : null;

// Express ミドルウェア（既存ルートの前に追加）
app.use((req, res, next) => {
  if (langfuse) {
    (req as any).langfuseTrace = langfuse.trace({ name: req.path });
  }
  next();
});
```

### 2-6. helpers.ts の wrapHandler() にスパンを追加

`wrapHandler()` 内でハンドラ呼び出し前後に span を作成してレイテンシ・エラーを記録する。

---

## Phase 3: 再デプロイ

```bash
npm run cdk:deploy -- --profile rag-poc-admin
```

---

## 動作確認

1. GenU Chat UI でいくつかの RAG チャットを送信
2. Langfuse UI（Phase 1 で取得した URL）を開く
3. Traces タブにリクエストが記録されているか確認
4. 各トレースでプロンプト・レスポンス・レイテンシが見えるか確認

---

## 注意点

- Langfuse の Solution Box デプロイが先に完了している必要がある
- Lambda のコールドスタート時に Langfuse クライアントが初期化されるため、初回レスポンスがわずかに遅くなる可能性がある
- Secret Key の管理は SSM Parameter Store を推奨
