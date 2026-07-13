# GenU ボット・エージェント作成ガイド

AgentCore Runtime を別リポジトリで作成し、genU から呼び出す場合は、[genU から外部 AgentCore Runtime を呼び出す方法](./EXTERNAL_AGENTCORE_INTEGRATION.md) を参照する。

## 使い分け

| 方式           | ファイル                              | tool use | 用途                                |
| -------------- | ------------------------------------- | -------- | ----------------------------------- |
| claude.ts 方式 | `packages/web/src/prompts/claude.ts`  | なし     | 対話・分析・生成・要約など          |
| agent.ts 方式  | `packages/cdk/lib/construct/agent.ts` | あり     | Web検索・コード実行・Lambda連携など |

ルール: **tool use が不要なら claude.ts、tool use が必要なら agent.ts**。

---

## claude.ts 方式（ボット）

システムプロンプトだけで動く GenU ユースケースページを追加する方法。

### 手順

**1. `packages/web/src/prompts/claude.ts` にシステムプロンプトを追加**

`systemContexts` オブジェクトにルートパスをキーとして追加する。

**注意:** `claude.ts` に日本語のシステムプロンプトを直接書くと、commit hook の `npm run lint` で `i18nhelper/no-jp-string` warning が発生し、`--max-warnings 0` により commit が失敗する。システムプロンプトは英語で書き、回答言語は `Automatically detect the language...` のような指示で制御する。

```typescript
// packages/web/src/prompts/claude.ts
const systemContexts: { [key: string]: string } = {
  '/chat': `...`,

  // ここに追加（例: data-analyst）
  '/data-analyst': `You are a data analysis and visualization assistant.
Read the provided data directly and perform all aggregation and calculations yourself.
Automatically detect the language of the user's request and think and answer in the same language.
...`,

  '/summarize': `...`,
  // ...
};
```

**2. `packages/web/src/main.tsx` にルートを追加**

```typescript
// /chat や /summarize と同じ形式で追加
{
  path: '/data-analyst',
  element: <ChatPage />,   // ファイルアップロード・チャット・EChart対応
},
```

ページの種類:

- `ChatPage` — ファイルアップロード・マルチターン・EChart描画に対応（推奨）
- `SummarizePage` — テキスト要約特化（ファイルアップロードなし）

**3. `packages/web/src/App.tsx` にサイドバー項目を追加**

```typescript
// react-icons/pi からアイコンをインポート
import { PiChartLineUp } from 'react-icons/pi';

// items 配列に追加
{
  label: t('navigation.dataAnalyst'),
  to: '/data-analyst',
  icon: <PiChartLineUp />,
  display: 'usecase' as const,
},
```

**4. `packages/web/public/locales/translation/en.yaml` に翻訳キーを追加**

```yaml
navigation:
  dataAnalyst: Data Analyst
```

**5. デプロイ**

```bash
npm run cdk:deploy -- --profile rag-poc-admin
```

### 実例

Data Analyst (`/data-analyst`) がこの方式で実装されている。

---

## agent.ts 方式（エージェント）

CDK で Bedrock Agent を定義し、Lambda action group（Web検索・コード実行等）を組み合わせる方法。

### 手順

**1. `packages/cdk/lib/construct/agent.ts` に `CfnAgent` を追加**

```typescript
import { CfnAgent, CfnAgentAlias } from 'aws-cdk-lib/aws-bedrock';

// Agent 本体
const myAgent = new CfnAgent(this, 'MyAgent', {
  agentName: `MyAgent-${suffix}`,
  agentResourceRoleArn: bedrockAgentRole.roleArn,
  foundationModel: props.foundationModel,
  idleSessionTtlInSeconds: 3600,
  autoPrepare: true,
  instruction: `Write the agent instruction (system prompt) here.
Automatically detect the language of the user's request and think and answer in the same language.`,

  // action group が必要な場合
  actionGroups: [
    // Lambda を呼び出す action group
    {
      actionGroupName: 'MyAction',
      actionGroupExecutor: {
        lambda: myLambda.functionArn,
      },
      apiSchema: {
        s3: {
          s3BucketName: schema.deployedBucket.bucketName,
          s3ObjectKey: 'api-schema/my-schema.json',
        },
      },
    },
    // Amazon 組み込み: ユーザー入力待ち
    {
      actionGroupName: 'UserInputAction',
      parentActionGroupSignature: 'AMAZON.UserInput',
    },
    // Amazon 組み込み: コードインタープリタ
    {
      actionGroupName: 'CodeInterpreter',
      parentActionGroupSignature: 'AMAZON.CodeInterpreter',
    },
  ],
});

// Alias（GenU から参照するために必須）
const myAgentAlias = new CfnAgentAlias(this, 'MyAgentAlias', {
  agentId: myAgent.attrAgentId,
  agentAliasName: 'v1',
});

// GenU の agents 配列に登録
this.agents.push({
  displayName: 'MyAgent', // UI 表示名
  agentId: myAgent.attrAgentId,
  aliasId: myAgentAlias.attrAgentAliasId,
  description: 'エージェントの説明',
});
```

**2. `packages/cdk/cdk.json` で `agentEnabled: true` を確認**

```json
{
  "context": {
    "agentEnabled": true
  }
}
```

**3. デプロイ**

```bash
npm run cdk:deploy -- --profile rag-poc-admin
```

デプロイ後、GenU の「エージェントチャット」メニューにエージェントが表示される。

### 組み込み action group

| `parentActionGroupSignature` | 機能                         |
| ---------------------------- | ---------------------------- |
| `AMAZON.UserInput`           | ユーザー入力待ち（ほぼ必須） |
| `AMAZON.CodeInterpreter`     | Python コード実行            |

### 実例

`SearchEngineAgent`（Web検索）と `CodeInterpreterAgent` がこの方式で実装されている。

---

## Console での手動作成は非推奨

Bedrock Console で手動作成したエージェントは `cdk:destroy` でも削除されず、git 管理外になる。
エージェントが必要な場合は必ず agent.ts で定義すること。
