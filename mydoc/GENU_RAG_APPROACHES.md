# GenU で RAG / Knowledge Base を使う 4 つの方式

GenU (generative-ai-use-cases) から Bedrock Knowledge Base を参照する方式を、
実機検証した結果とともに整理する。

| 前提                    | 値                            |
| ----------------------- | ----------------------------- |
| GenU バージョン         | v5.4.0                        |
| アカウント / リージョン | 035351467732 / ap-northeast-1 |
| デプロイ                | CDK (`-c env=dev`)            |
| 検証日                  | 2026-07-14                    |

## 0. 先に結論

| #     | 方式                           | KB を誰が作るか        | ベクトルストア             | 常時課金                    | GenU 改変      | 検証状況            |
| ----- | ------------------------------ | ---------------------- | -------------------------- | --------------------------- | -------------- | ------------------- |
| **1** | **GenU 自動生成 RAG**          | GenU の CDK            | OpenSearch Serverless 固定 | **あり(高)**                | 不要           | 未実施              |
| **2** | **手動作成 KB + RAG チャット** | 自分(マネコン/CLI/CDK) | 自由に選べる               | **なし**(S3 Vectors 選択時) | 不要           | ✅ **動作確認済み** |
| **3** | **エージェントビルダー**       | 自分                   | 自由                       | なし                        | 不要(設定のみ) | 未検証              |
| **4** | **外部 AgentCore Runtime**     | 自分                   | 自由(Managed も可)         | なし                        | 不要           | ✅ **動作確認済み** |

**現在の稼働構成**: 方式2(RAG チャット)と方式4(AgentCore)が並行稼働している。

---

## 1. GenU 自動生成 RAG

GenU の CDK に Knowledge Base ごと作らせる、公式ドキュメントの標準手順。

### 構成

```text
GenU (RAG チャット)
  ↓ RetrieveAndGenerate
Knowledge Base            ← GenU の CDK が作成 (RagKnowledgeBaseStack)
  ↓
OpenSearch Serverless     ← GenU の CDK が作成(固定・変更不可)
  ↑
S3 データソース + Web クローラー  ← GenU の CDK が作成
```

### 設定

`parameter.ts` の env ブロックに書く。**`ragKnowledgeBaseId` は指定しない。**

```typescript
dev: {
  ragKnowledgeBaseEnabled: true,
  // ragKnowledgeBaseId は書かない → GenU が KB を新規作成する
  ragKnowledgeBaseStandbyReplicas: false,  // シングル AZ。OCU コストを半減
  embeddingModelId: 'amazon.titan-embed-text-v2:0',
  rerankingModelId: 'amazon.rerank-v1:0',  // 任意
  queryDecompositionEnabled: true,         // 任意
}
```

### ドキュメントの投入

`packages/cdk/rag-docs/docs/` にファイルを置くと、**デプロイ時に自動で S3 へアップロード**される
(既定で Bedrock / Nova のユーザーガイドがサンプルとして入っている)。

デプロイ後、**Bedrock マネコンでデータソースを手動 Sync** する必要がある。

### 特徴

| 観点           | 内容                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 手間           | **最小**。KB を自分で作る必要がない                                                                                                                                                  |
| ベクトルストア | **OpenSearch Serverless 固定**。S3 Vectors は選べない([rag-knowledge-base-stack.ts:192](../packages/cdk/lib/rag-knowledge-base-stack.ts#L192) で `oss.CfnCollection` をハードコード) |
| 機能           | GenU の RAG 機能をフル活用できる(ハイブリッド検索、reranking、query decomposition)                                                                                                   |
| **コスト**     | **OpenSearch Serverless の常時課金**。`standbyReplicas: false` でも最低 OCU 分は課金され続ける(概算 月 $350〜。**要試算**)                                                           |

### 落とし穴(公式ドキュメント記載)

> `ragKnowledgeBaseEnabled: false` に戻して再デプロイしても **`RagKnowledgeBaseStack` は残る**。
> CloudFormation から手動削除しないと OpenSearch の課金が続く。

なお **デプロイのたびに KB が増えることはない**。スタック名が
`RagKnowledgeBaseStack${env}` で固定されており、2回目以降は同じスタックを更新するだけ。

---

## 2. 手動作成 KB + RAG チャット ★ 現在稼働中

自分で作った Knowledge Base の ID を GenU に教える。**GenU 公式サポートの正規機能。**

### 構成

```text
GenU (RAG チャット / ユースケースビルダー)
  ↓ RetrieveAndGenerate / Retrieve
Knowledge Base  genu-manual-s3vectors-kb (HO8P6XRCIE)   ← 自分で作成
  ↓
S3 Vectors  genu-rag-vectors-.../index/genu-manual-index  ← 自分で作成
  ↑
S3  mpoc1-agentcore-kb-.../sample-manual.md
```

### 設定

```typescript
dev: {
  modelRegion: 'ap-northeast-1',      // KB と同じリージョンにする(必須)
  ragKnowledgeBaseEnabled: true,
  ragKnowledgeBaseId: 'HO8P6XRCIE',   // ← 指定すると OpenSearch は作られない
}
```

`ragKnowledgeBaseId` を指定すると `RagKnowledgeBaseStack` が**作成されない**
([create-stacks.ts:67](../packages/cdk/lib/create-stacks.ts#L67) の
`params.ragKnowledgeBaseEnabled && !params.ragKnowledgeBaseId`)。

### KB の作り方

マネコン / AWS CLI / CDK のいずれでもよい(今回は CLI で作成)。ベクトルストアは自由に選べる。

```bash
# 1. S3 Vectors のベクトルバケットとインデックス
aws s3vectors create-vector-bucket --vector-bucket-name <name>
aws s3vectors create-index --vector-bucket-name <name> --index-name <idx> \
  --data-type float32 --dimension 1024 --distance-metric cosine \
  --metadata-configuration '{"nonFilterableMetadataKeys":["AMAZON_BEDROCK_TEXT","AMAZON_BEDROCK_METADATA"]}'

# 2. Bedrock KB(storageConfiguration に S3_VECTORS を指定)
aws bedrock-agent create-knowledge-base \
  --knowledge-base-configuration '{"type":"VECTOR","vectorKnowledgeBaseConfiguration":{"embeddingModelArn":"...titan-embed-text-v2:0"}}' \
  --storage-configuration '{"type":"S3_VECTORS","s3VectorsConfiguration":{"indexArn":"<index-arn>"}}' \
  --role-arn <kb-service-role>

# 3. データソース + 同期
aws bedrock-agent create-data-source --data-source-configuration '{"type":"S3","s3Configuration":{"bucketArn":"..."}}'
aws bedrock-agent start-ingestion-job --knowledge-base-id <kb> --data-source-id <ds>
```

### 検証結果(実測)

| GenU の機能                                       | 使用 API                                  | S3 Vectors KB での結果      |
| ------------------------------------------------- | ----------------------------------------- | --------------------------- |
| **RAG チャット**                                  | `RetrieveAndGenerate`                     | ✅ **動く**。引用付きで正答 |
| `{{retrieveKnowledgeBase}}`(ユースケースビルダー) | `Retrieve` + `overrideSearchType: HYBRID` | ❌ **エラー**               |

`{{retrieveKnowledgeBase}}` が失敗する理由:

```
ValidationException: HYBRID search type is not supported for search operation on index HO8P6XRCIE.
```

GenU が [retrieveKnowledgeBase.ts:38](../packages/cdk/lambda/retrieveKnowledgeBase.ts#L38) で
`overrideSearchType: 'HYBRID'` を**ハードコード**しているが、S3 Vectors はハイブリッド検索に非対応
(対応するのは OpenSearch Serverless / RDS / MongoDB のみ)。サイレントフォールバックはしない。

**回避策**: `HYBRID` → `SEMANTIC` の 1 行改変で動く(実測で確認)。ただし GenU 本体を触ることになる。
OpenSearch Serverless の KB を使えば改変不要で両方動く。

### 運用

- **ドキュメント更新時、GenU の再デプロイは不要。** S3 にファイルを置いて Sync するだけ
  (GenU は KB の **ID** しか持っておらず、実行時に Bedrock へ問い合わせるため)
- **再デプロイが要るのは、参照する KB を別の ID に変えるときだけ**

---

## 3. エージェントビルダー

GenU 内蔵の AgentCore Runtime(Strands)を使い、画面からエージェントを組み立てる機能。

### 構成

```text
GenU (エージェントビルダー)
  ↓ InvokeAgentRuntime
GenU 内蔵 AgentCore Runtime   ← agentBuilderEnabled: true で GenU が作成
  ↓ MCP (stdio)
MCP サーバ群                  ← mcp-configs/agent-builder/mcp.json で定義
```

### 設定

```typescript
dev: {
  agentBuilderEnabled: true,
  agentCoreGatewayArns: ['arn:aws:bedrock-agentcore:...:gateway/<id>'],  // 任意
}
```

### KB への到達手段

**Bedrock KB を直接検索するツールは内蔵されていない**(汎用 Runtime に `Retrieve` の実装なし)。
KB を使うには **AgentCore Gateway 経由**にする。

Runtime の MCP クライアントは **stdio のみ**対応
([tools.py:34](../packages/cdk/lambda-python/generic-agent-core-runtime/src/tools.py#L34) の `stdio_client`)。
Gateway は SigV4 の HTTP なので直接は繋がらないが、**GenU は `mcp-proxy-for-aws` を使った
Gateway 接続テンプレートを標準で同梱している**。

`packages/cdk/lambda-python/generic-agent-core-runtime/mcp-configs/agent-builder/mcp.json`

```json
"tavily-gateway": {
  "command": "uvx",
  "args": [
    "mcp-proxy-for-aws",
    "https://<your-gateway-id>.gateway.bedrock-agentcore.<region>.amazonaws.com/mcp"
  ]
}
```

この URL を自分の Gateway に差し替えれば、Gateway の KB コネクタ経由で KB を検索できるはず。

IAM は自動で通る。`agentCoreGatewayArns` を指定すればそのARNに、指定しなければ `*` に対して
`bedrock-agentcore:InvokeGateway` が付与される
([generic-agent-core.ts:341](../packages/cdk/lib/construct/generic-agent-core.ts#L341))。

### 特徴

| 観点         | 内容                                                                          |
| ------------ | ----------------------------------------------------------------------------- |
| 手間         | 中。Gateway と KB を別途用意し、mcp.json を編集する必要がある                 |
| 拡張性       | **高い**。KB に加えて Web 検索・コード実行・各種 MCP サーバを組み合わせられる |
| KB の種類    | Gateway 経由なので **Managed KB でも可**(Gateway が適切に呼んでくれる)        |
| コスト       | AgentCore Runtime の実行課金のみ。常時課金なし                                |
| **検証状況** | **未検証**。mcp.json の編集(= GenU ソースの変更)が要る点に注意                |

---

## 4. 外部 AgentCore Runtime ★ 現在稼働中

自分で作った AgentCore Runtime を GenU から呼ぶ。GenU の RAG 機能は一切通らない。

### 構成

```text
GenU (AgentCore ユースケース)
  ↓ InvokeAgentRuntime (Cognito の一時クレデンシャル)
AgentCore Runtime  BedrockAgent_BedrockAgent   ← 別リポジトリ (aws-agentcore-sample)
  ↓ MCP over streamable HTTP + IAM (SigV4)
AgentCore Gateway  sample-manual-gw
  ↓ Knowledge Base Connector
Managed KB  sample-manual-kb (UFPZW5A69W)
```

### 設定

```typescript
dev: {
  agentCoreRegion: 'ap-northeast-1',
  agentCoreExternalRuntimes: [
    {
      name: 'BedrockAgent_BedrockAgent',
      display_name: '別戸六区 英慈円斗',
      description: '...',
      arn: 'arn:aws:bedrock-agentcore:ap-northeast-1:035351467732:runtime/BedrockAgent_BedrockAgent-052O95DjiR',
    },
  ],
}
```

Cognito の認証済みロールに `bedrock-agentcore:InvokeAgentRuntime` が自動付与される。

### 検証結果

✅ **GenU の画面から質問して、KB 由来の回答を得られることを確認済み**
(「システム利用時間は?」→「平日の午前8時から午後6時まで」。CloudWatch にツール呼び出しの記録あり)

### 特徴

| 観点                    | 内容                                                                                                                           |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Managed KB が使える** | ✅ **この方式だけ**。Gateway が Managed KB に適した呼び出しをするため                                                          |
| 拡張性                  | 高い。Runtime のコードを自由に書ける                                                                                           |
| 手間                    | 大。別リポジトリで Runtime を実装・デプロイする必要がある                                                                      |
| GenU の RAG 機能        | **使わない**(RAG チャット / `{{retrieveKnowledgeBase}}` とは無関係)                                                            |
| 制約                    | GenU 画面のシステムプロンプト欄が Runtime に無視される(Runtime 側がハードコードしているため。修正すれば画面から編集可能になる) |

詳細は [AGENTCORE_GATEWAY_KB_INTEGRATION.md](AGENTCORE_GATEWAY_KB_INTEGRATION.md) を参照。

---

## 5. Knowledge Base の種類と GenU の相性(重要)

**「Managed KB」はマネコンで作った KB という意味ではない。** Bedrock の KB が持つ `type` 属性の値。

| KB の type           | ベクトルストア                                                               | 実体                                   |
| -------------------- | ---------------------------------------------------------------------------- | -------------------------------------- |
| **`MANAGED`** (FMKB) | **露出しない** (`storageConfiguration: null`)                                | AWS が内部で隠蔽。こちらからは触れない |
| **`VECTOR`**         | 自分で指定 (`S3_VECTORS` / `OPENSEARCH_SERVERLESS` / `RDS` / `PINECONE` ...) | 自分が所有する資源を KB が参照する     |

作成ツールとは無関係。AgentCore CLI (`agentcore add knowledge-base`) は **FMKB しか作れない**
(`--help` に「Add a knowledge base (FMKB)」と明記され、ベクトルストアを選ぶオプションが無い)。
マネコンからは両方作れる。

### Managed KB は GenU の RAG 機能では使えない(実測)

| GenU の呼び出し                                                       | Managed KB での結果                                                                                                                                                   |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RetrieveAndGenerate`(RAG チャット)                                   | ❌ `ValidationException: This operation is not supported for managed knowledge bases.`                                                                                |
| `Retrieve` + `vectorSearchConfiguration`(`{{retrieveKnowledgeBase}}`) | ❌ `ValidationException: Incompatible configuration: vectorSearchConfiguration is not supported for managed knowledge bases. Use managedSearchConfiguration instead.` |

- **RAG チャットは AWS の API 自体が Managed KB 非対応** → GenU をどう改変しても救えない
- `{{retrieveKnowledgeBase}}` は `managedSearchConfiguration` に分岐させれば理論上動く(未検証)
- GenU に `managedSearchConfiguration` の実装は**存在しない**(grep で 0 件)

**Managed KB を使いたいなら、方式4(AgentCore Gateway 経由)しかない。**

---

## 6. 設定を書く場所(ハマりどころ)

`parameter.ts` に env ブロック(例: `dev`)を定義すると、**`cdk.json` の context は完全に無視される。**

```typescript
// parameter.ts の実装
if (envs[params.env]) {
  params = stackInputSchema.parse({ ...envs[params.env], env: params.env });
  // ↑ cdk.json の内容は混ざらない。スキーマ既定値 + envs[env] だけ
}
```

つまり `-c env=dev` でデプロイしている限り:

- `cdk.json` に何を書いても効かない
- **書き忘れた項目はスキーマ既定値になる**。特に `modelRegion` の既定は **`us-east-1`**
  ([stack-input.ts:34](../packages/cdk/lib/stack-input.ts#L34))
- KB は `modelRegion` と同じリージョンに必要([retrieveKnowledgeBase.ts](../packages/cdk/lambda/retrieveKnowledgeBase.ts) が `MODEL_REGION` で検索する)

**GenU 公式ドキュメントは parameter.ts と cdk.json の両方の例を載せているが、この優先順位には
触れていない。** 両方に書くと「cdk.json も効いている」と誤解する。

### IAM の手当ては不要

外部 KB を指定しても **IAM を手で追加する必要はない**。GenU は Lambda に
`bedrock:*` を `resources: ['*']` で付与している([api.ts:563](../packages/cdk/lib/construct/api.ts#L563))。

> 「既存 KB を使うには Lambda ロールに `bedrock:Retrieve` を手動追加する必要がある」という
> 情報を見かけたが、**誤り**。実測でも AccessDenied ではなく ValidationException が返っており、
> IAM は最初から通っていた。

---

## 7. 選び方

| やりたいこと                                                  | 推奨方式                                                       |
| ------------------------------------------------------------- | -------------------------------------------------------------- |
| とにかく簡単に RAG を試したい。**コストは気にしない**         | **方式1**(GenU 自動生成)。`rag-docs/docs` にファイルを置くだけ |
| **常時課金を避けたい**。RAG チャットを使いたい                | **方式2 + S3 Vectors** ← 現在の構成                            |
| ハイブリッド検索や reranking が要る                           | 方式1、または方式2 で OpenSearch の KB を自作                  |
| ユースケースビルダーの `{{retrieveKnowledgeBase}}` を使いたい | 方式1、または方式2 + `HYBRID`→`SEMANTIC` の 1 行改変           |
| KB に加えて Web 検索・コード実行なども組み合わせたい          | 方式3(エージェントビルダー)または方式4                         |
| **Managed KB (FMKB) を使いたい**                              | **方式4 のみ**                                                 |
| エージェントのロジックを自分で書きたい                        | 方式4                                                          |

---

## 8. 現在のリソース一覧

| リソース                    | 識別子                                                                    | 使われ方                         |
| --------------------------- | ------------------------------------------------------------------------- | -------------------------------- |
| Knowledge Base (S3 Vectors) | `genu-manual-s3vectors-kb` / `HO8P6XRCIE`                                 | **GenU の RAG チャットが参照**   |
| S3 Vectors ベクトルバケット | `genu-rag-vectors-035351467732-apne1`                                     | 上記 KB のベクトルストア         |
| S3 Vectors インデックス     | `genu-manual-index`(1024次元 / cosine)                                    | 同上                             |
| KB 用 IAM ロール            | `GenUS3VectorsKBRole`                                                     | 同上                             |
| データソース                | `manual-s3-source` / `PMCPZEJTFD`                                         | 同上                             |
| Knowledge Base (Managed)    | `sample-manual-kb` / `UFPZW5A69W`                                         | **AgentCore エージェントが参照** |
| AgentCore Gateway           | `sample-manual-gw-s08lru8q3m`                                             | 同上                             |
| AgentCore Runtime           | `BedrockAgent_BedrockAgent-052O95DjiR`                                    | 同上                             |
| 元ドキュメント              | `s3://mpoc1-agentcore-kb-035351467732-ap-northeast-1-an/sample-manual.md` | 両方の KB が参照                 |
| OpenSearch Serverless       | **なし**                                                                  | **常時課金は発生していない**     |

## 9. 未検証の論点

1. **方式3(エージェントビルダー)は未検証。** `mcp.json` の Gateway テンプレートを自分の Gateway に
   差し替えれば KB に到達できるはずだが、実機で確認していない。
   mcp.json の編集は GenU ソースの変更にあたる点にも注意。
2. **OpenSearch Serverless の実コスト。** `standbyReplicas: false` での最低 OCU 数と月額を確定させたい
   (本ドキュメントの $350 は概算)。
3. **S3 Vectors のセマンティック検索のみで実用上十分か。** 日本語の固有名詞・型番の完全一致が
   重要な用途では、ハイブリッド検索が使える OpenSearch のほうが有利と思われる。
4. **`overrideSearchType` を設定可能にする改善。** GenU 本体にハードコードされているため、
   S3 Vectors 利用者は毎回パッチが必要になる。アップストリームへの提案候補。
