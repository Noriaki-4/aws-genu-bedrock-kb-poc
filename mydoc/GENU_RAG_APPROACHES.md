# GenU で RAG / Knowledge Base を使う 4 つの方式

GenU (generative-ai-use-cases) から Bedrock Knowledge Base を参照する方式を、
実機検証した結果とともに整理する。

PDF高度解析で発生した問題、原因、修正、再発防止は
[GENU_KB_PDF_ADVANCED_PARSING_TROUBLESHOOTING.md](./GENU_KB_PDF_ADVANCED_PARSING_TROUBLESHOOTING.md)
を参照する。

| 前提                    | 値                            |
| ----------------------- | ----------------------------- |
| GenU バージョン         | v5.4.0                        |
| アカウント / リージョン | 035351467732 / ap-northeast-1 |
| デプロイ                | CDK (`-c env=dev`)            |
| 検証日                  | 2026-07-20                    |

## 0. 先に結論

| #     | 方式                           | KB を誰が作るか        | ベクトルストア                     | 常時課金                    | GenU 改変       | 検証状況            |
| ----- | ------------------------------ | ---------------------- | ---------------------------------- | --------------------------- | --------------- | ------------------- |
| **1** | **GenU 自動生成 RAG**          | GenU の CDK            | OpenSearch Serverless / S3 Vectors | S3 Vectors は常時 OCU なし  | このレポで対応  | ✅ **動作確認済み** |
| **2** | **手動作成 KB + RAG チャット** | 自分(マネコン/CLI/CDK) | 自由に選べる                       | **なし**(S3 Vectors 選択時) | 不要            | ✅ **動作確認済み** |
| **3** | **エージェントビルダー**       | 自分                   | 自由(Managed も可)                 | なし                        | mcp.json を編集 | ✅ **動作確認済み** |
| **4** | **外部 AgentCore Runtime**     | 自分                   | 自由(Managed も可)                 | なし                        | 不要            | ✅ **動作確認済み** |

**現在の稼働構成**: 方式1(RAG チャット / Use Case Builder)・方式3(エージェントビルダー)・方式4(外部 AgentCore)が
並行稼働している。OpenSearch Serverless は 1 つも作られておらず、常時課金は発生していない。

**要点**: Managed KB は GenU の RAG 機能(方式1・2)では原理的に使えないが、
**AgentCore Gateway を経由する方式3・4なら使える**。そして「KB を検索するエージェント」が
目的なら、**方式3で足りる**(方式4のように自分で Runtime を実装する必要はない)。

---

## 1. GenU 自動生成 RAG

GenU の CDK に Knowledge Base ごと作らせる、公式ドキュメントの標準手順。

### 構成

```text
GenU (RAG チャット)
  ↓ RetrieveAndGenerate
Knowledge Base            ← GenU の CDK が作成 (RagKnowledgeBaseStack)
  ↓
OpenSearch Serverless または S3 Vectors
  ↑
S3 データソース                  ← GenU の CDK が作成
Web クローラー                    ← OpenSearch Serverless 選択時のみ
```

### 設定

`parameter.ts` の env ブロックに書く。**`ragKnowledgeBaseId` は指定しない。**

```typescript
dev: {
  ragKnowledgeBaseEnabled: true,
  // ragKnowledgeBaseId は書かない → GenU が KB を新規作成する
  ragKnowledgeBaseVectorStoreType: 'S3_VECTORS',
  ragKnowledgeBaseSearchType: 'SEMANTIC',
  ragKnowledgeBaseDeployDefaultDocuments: false,
  ragKnowledgeBaseAdvancedParsing: true,
  ragKnowledgeBaseAdvancedParsingModelId:
    'jp.anthropic.claude-haiku-4-5-20251001-v1:0',
  embeddingModelId: 'amazon.titan-embed-text-v2:0',
}
```

### ドキュメントの投入

`ragKnowledgeBaseDeployDefaultDocuments: true` の場合は、`packages/cdk/rag-docs/docs/` のファイルが
デプロイ時に自動で S3 へアップロードされる。高度解析の費用とスロットリングを管理するため、
現行 `dev` では `false` とし、専用バケットの `docs/` へ評価済み PDF だけを手動配置する。

デプロイ後、**Bedrock マネコンでデータソースを手動 Sync** する必要がある。

### 特徴

| 観点           | 内容                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 手間           | **最小**。KB を自分で作る必要がない                                                                                      |
| ベクトルストア | `OPENSEARCH_SERVERLESS` と `S3_VECTORS` を選択可能。S3 Vectors は 1024 次元 / float32 / cosine で作成される              |
| 機能           | OpenSearch は `HYBRID`、S3 Vectors は `SEMANTIC` を使用する。高度解析では表を Markdown、図表を検索可能な説明文に変換する |
| **コスト**     | S3 Vectors は OpenSearch Serverless の常時 OCU 課金を避けられる。Foundation Model parser の解析料金は同期ごとに発生する  |

### 落とし穴(公式ドキュメント記載)

> `ragKnowledgeBaseEnabled: false` に戻して再デプロイしても **`RagKnowledgeBaseStack` は残る**。
> CloudFormation から手動削除しないと OpenSearch の課金が続く。

なお **デプロイのたびに KB が増えることはない**。スタック名が
`RagKnowledgeBaseStack${env}` で固定されており、2回目以降は同じスタックを更新するだけ。

---

## 2. 手動作成 KB + RAG チャット（ロールバック用）

自分で作った Knowledge Base の ID を GenU に教える。旧 KB `HO8P6XRCIE` は現在も
`ACTIVE` であり、方式1に問題があった場合のロールバック先として保持している。

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

**回避策**: `ragKnowledgeBaseSearchType: 'SEMANTIC'` を設定する。検索方式は設定から API Lambda へ渡されるため、S3 Vectors 利用時にソースコードを都度変更する必要はない。OpenSearch Serverless では `HYBRID` を指定できる。

このレポでは `ragKnowledgeBaseVectorStoreType: 'S3_VECTORS'` を指定すると、S3 Vector Bucket、Index、Knowledge Base、Data Source を CDK で一括作成できる。PDF の高度解析を使う場合は `ragKnowledgeBaseAdvancedParsing: true` と parser model ID も指定する。

### 運用

- **ドキュメント更新時、GenU の再デプロイは不要。** S3 にファイルを置いて Sync するだけ
  (GenU は KB の **ID** しか持っておらず、実行時に Bedrock へ問い合わせるため)
- **再デプロイが要るのは、参照する KB を別の ID に変えるときだけ**

---

## 3. エージェントビルダー ★ 現在稼働中

GenU 内蔵の AgentCore Runtime(Strands)を使い、画面からエージェントを組み立てる機能。

### 構成

```text
GenU (エージェントビルダー /agent-builder)
  ↓ InvokeAgentRuntime
GenU 内蔵 AgentCore Runtime  GenUAgentBuilderRuntimedev   ← agentBuilderEnabled: true で GenU が作成
  ↓ MCP (stdio) → uvx mcp-proxy-for-aws が SigV4 に変換
AgentCore Gateway  sample-manual-gw
  ↓ Knowledge Base Connector
Managed KB  sample-manual-kb (UFPZW5A69W)
```

### 設定

```typescript
dev: {
  agentBuilderEnabled: true,
  agentCoreGatewayArns: [
    'arn:aws:bedrock-agentcore:ap-northeast-1:035351467732:gateway/sample-manual-gw-s08lru8q3m',
  ],
}
```

### KB への到達手段

**Bedrock KB を直接検索するツールは内蔵されていない**(汎用 Runtime に `Retrieve` の実装なし)。
KB を使うには **AgentCore Gateway 経由**にする。

Runtime の MCP クライアントは **stdio のみ**対応
([tools.py:34](../packages/cdk/lambda-python/generic-agent-core-runtime/src/tools.py#L34) の `stdio_client`)。
Gateway は SigV4 の HTTP なので直接は繋がらないが、**GenU は `mcp-proxy-for-aws` を使った
Gateway 接続テンプレートを標準で同梱している**(`tavily-gateway` という placeholder)。

これを自分の Gateway に向けたエントリを
`packages/cdk/lambda-python/generic-agent-core-runtime/mcp-configs/agent-builder/mcp.json`
に追加する。

```json
"manual-kb-gateway": {
  "command": "uvx",
  "args": [
    "mcp-proxy-for-aws",
    "https://sample-manual-gw-s08lru8q3m.gateway.bedrock-agentcore.ap-northeast-1.amazonaws.com/mcp"
  ],
  "metadata": {
    "category": "AWS",
    "description": "Searches the staff manual through the AgentCore Gateway's Knowledge Base connector"
  }
}
```

URL だけ渡せばよい。`mcp-proxy-for-aws` は **`--service` をエンドポイントから自動推論**し、
**`--region` は `AWS_REGION` 環境変数から取得**する(Runtime が両方を満たす)。

IAM は自動で通る。`agentCoreGatewayArns` を指定すればその ARN に限定して、指定しなければ `*` に対して
`bedrock-agentcore:InvokeGateway` が付与される
([generic-agent-core.ts:341](../packages/cdk/lib/construct/generic-agent-core.ts#L341))。

### 検証結果(実測)

✅ **GenU の画面から質問して、KB 由来の回答を得られることを確認済み。**

- エージェントビルダーの画面(`/agent-builder`)でエージェントを作成し、
  MCP サーバとして `manual-kb-gateway` を選択
- 「システム利用時間は?」→「平日の午前8時から午後6時まで」
- CloudWatch Logs (`/aws/bedrock-agentcore/runtimes/GenUAgentBuilderRuntimedev-*-DEFAULT`) に
  KB ツール `target-quick-start-b083cf___Retrieve` の呼び出しを確認。AccessDenied なし

### 注意点

- **UI 上の場所**: エージェントビルダーは **`/agent-builder`** という専用ページ。
  「ビルダーモード」トグルで切り替わる**ユースケースビルダーとは別物**なので混同しやすい
- **デプロイにローカル Docker が必要**。この Runtime は CDK の Docker イメージアセット
  ([generic-agent-core.ts:237](../packages/cdk/lib/construct/generic-agent-core.ts#L237) の
  `AgentRuntimeArtifact.fromAsset`)で、**`cdk deploy` を実行したマシン上で `docker build` が走る**。
  Docker Desktop が停止していると `Cannot connect to the Docker daemon` で失敗する
  (RAG チャットや外部 Runtime のデプロイでは Docker は不要だった)
- **初回応答が遅い**。コンテナのコールドスタートに加え、`uvx` が PyPI から
  `mcp-proxy-for-aws` を取得するため

### 特徴

| 観点         | 内容                                                                          |
| ------------ | ----------------------------------------------------------------------------- |
| 手間         | 中。Gateway と KB を別途用意し、mcp.json に1エントリ追加する                  |
| 拡張性       | **高い**。KB に加えて Web 検索・コード実行・各種 MCP サーバを組み合わせられる |
| KB の種類    | Gateway 経由なので **Managed KB でも可**(Gateway が適切に呼んでくれる)        |
| コスト       | AgentCore Runtime の実行課金のみ。常時課金なし                                |
| GenU 改変    | **mcp.json の編集が必要**。アップストリーム更新時に再適用が要る               |
| **検証状況** | ✅ **動作確認済み**                                                           |

### 外部 AgentCore Runtime(方式4)との使い分け

**KB を検索するエージェントが欲しいだけなら、外部 Runtime を自分で書く必要はない。**
エージェントビルダーで同じことができる(実測で確認)。

|                              | 方式3 エージェントビルダー    | 方式4 外部 Runtime                                            |
| ---------------------------- | ----------------------------- | ------------------------------------------------------------- |
| エージェントのコード         | **不要**(GenU 同梱)           | **自分で書く**(main.py、MCP クライアント、ストリーミング処理) |
| デプロイ                     | GenU の CDK に含まれる        | 別リポジトリで `agentcore deploy`                             |
| Gateway 接続                 | mcp.json に URL を1行足すだけ | 自分で `mcp-proxy-for-aws` を組み込む                         |
| 独自ロジック・独自ツール     | ❌ MCP サーバ経由のみ         | ✅ Python で自由に書ける                                      |
| モデル・プロンプトの完全制御 | ❌ 画面から一部のみ           | ✅                                                            |
| GenU のソースを触らない      | ❌ mcp.json の編集が要る      | ✅                                                            |

「単に KB を検索したい」なら方式3、「エージェントのロジックを作り込みたい」なら方式4。

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

**Managed KB を使いたいなら、AgentCore Gateway を経由する方式3か方式4を選ぶ。**
Gateway の KB コネクタが Managed KB に適した呼び出しをしてくれるため、GenU の RAG コードを
一切通らずに検索できる。方式3(エージェントビルダー)のほうが手間が小さい。

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
| **常時課金を避けたい**。RAG チャットを使いたい                | **方式1 + S3 Vectors** ← 現在の構成                            |
| ハイブリッド検索や reranking が要る                           | 方式1、または方式2 で OpenSearch の KB を自作                  |
| ユースケースビルダーの `{{retrieveKnowledgeBase}}` を使いたい | 方式1または方式2で `ragKnowledgeBaseSearchType` を設定         |
| KB に加えて Web 検索・コード実行なども組み合わせたい          | **方式3**(エージェントビルダー)。方式4より手間が小さい         |
| **Managed KB (FMKB) を使いたい**                              | **方式3 または方式4**(Gateway 経由)。方式3のほうが楽           |
| KB を検索するエージェントが欲しいだけ                         | **方式3**。方式4のように Runtime を自作する必要はない          |
| エージェントのロジックを自分で書き込みたい                    | 方式4                                                          |

---

## 8. 現在のリソース一覧

| リソース                          | 識別子                                                                    | 使われ方                                                  |
| --------------------------------- | ------------------------------------------------------------------------- | --------------------------------------------------------- |
| Knowledge Base (CDK / S3 Vectors) | `generative-ai-use-cases-jpdev` / `JSODYFCDEY`                            | **方式1: GenU の RAG チャット / Use Case Builder が参照** |
| S3 Vectors ベクトルバケット       | `generative-ai-use-cases-jpdev-vectors`                                   | 現行 KB のベクトルストア                                  |
| S3 Vectors インデックス           | `bedrock-knowledge-base-default` (1024次元 / cosine)                      | 同上                                                      |
| データソース                      | `Z9WZZTL544` / `docs/`                                                    | Claude Haiku 4.5 parser による PDF 高度解析               |
| Knowledge Base (旧・手動)         | `genu-manual-s3vectors-kb` / `HO8P6XRCIE`                                 | **方式2: ロールバック用**                                 |
| 旧 S3 Vectors バケット            | `genu-rag-vectors-035351467732-apne1`                                     | 旧 KB のベクトルストア                                    |
| 旧 S3 Vectors インデックス        | `genu-manual-index` (1024次元 / cosine)                                   | 同上                                                      |
| 旧データソース                    | `manual-s3-source` / `PMCPZEJTFD`                                         | 同上                                                      |
| Knowledge Base (Managed)          | `sample-manual-kb` / `UFPZW5A69W`                                         | **方式3・4 が Gateway 経由で参照**                        |
| AgentCore Gateway                 | `sample-manual-gw-s08lru8q3m`                                             | 同上                                                      |
| AgentCore Runtime (GenU内蔵)      | `GenUAgentBuilderRuntimedev`                                              | **方式3: エージェントビルダー**                           |
| AgentCore Runtime (外部)          | `BedrockAgent_BedrockAgent-052O95DjiR`                                    | **方式4: 別戸六区 英慈円斗**                              |
| 元ドキュメント                    | `s3://mpoc1-agentcore-kb-035351467732-ap-northeast-1-an/sample-manual.md` | 両方の KB が参照                                          |
| OpenSearch Serverless             | **なし**                                                                  | **常時課金は発生していない**                              |

2026-07-21に評価用PDF内のPNGとPDF配置枠の縦横比を一致させ、文字サイズを変更せずに
横方向約17.4%の圧縮を解消した。ingestion job `VP86QYG8ID` は更新1文書・失敗0件で完了し、
画像内のラック状態と凡例「正常・注意・高温」を正しく抽出できることを確認した。

BedrockのページメタデータはこのPDFでは0始まりであるため、GenU側で1始まりへ変換してから
出典表示と `#page=` に使用する。これにより、3ページ目の検索結果は「3 page」と表示され、
リンクもPDFの3ページ目を開く。

## 9. 未検証の論点

1. **OpenSearch Serverless の実コスト。** `standbyReplicas: false` での最低 OCU 数と月額を確定させたい
   (本ドキュメントの $350 は概算)。
2. **S3 Vectors のセマンティック検索のみで実用上十分か。** 日本語の固有名詞・型番の完全一致が
   重要な用途では、ハイブリッド検索が使える OpenSearch のほうが有利と思われる。
3. **`{{retrieveKnowledgeBase}}` の Managed KB 対応。** `managedSearchConfiguration` に分岐させれば
   理論上動くが未検証。ただし RAG チャットは API レベルで非対応なので救えない。
