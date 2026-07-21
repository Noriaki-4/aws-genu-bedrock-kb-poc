# GenU Knowledge Base PDF 高度解析 実装計画

## 1. 目的

GenU の RAG Knowledge Base で PDF 内の文章、表、画像・グラフを検索可能にする。
文章は通常テキスト、表は Markdown、画像・グラフは自然言語の説明としてベクトル化する。
抽出画像ファイル自体の保存・配信は今回の対象外とする。

## 2. 採用方式と判断

- Knowledge Base と GenU のモデルリージョンは `ap-northeast-1`（東京）を維持する。
- Knowledge Bases の Amazon Bedrock Data Automation parser は、現行の AWS 仕様では
  `us-west-2`（オレゴン）のみサポートされるため採用しない。
- 東京で利用可能な Foundation Model parser として
  `amazon.nova-lite-v1:0` を使用する。
- ベクトルストアには、OpenSearch Serverless の常時課金を避けるため S3 Vectors を使用する。
- S3 Vectors はハイブリッド検索をサポートしないため、検索方式は `SEMANTIC` とする。

参考:

- [Knowledge Bases の parser 対応リージョン](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base-supported.html#knowledge-base-supported-parsing)
- [Knowledge Bases の高度な解析](https://docs.aws.amazon.com/bedrock/latest/userguide/kb-advanced-parsing.html)

## 3. 移行前構成

| リソース        | 現行値                                    |
| --------------- | ----------------------------------------- |
| Knowledge Base  | `genu-manual-s3vectors-kb` / `HO8P6XRCIE` |
| リージョン      | `ap-northeast-1`                          |
| ベクトルストア  | S3 Vectors / `genu-manual-index`          |
| Data Source     | `manual-s3-source` / `PMCPZEJTFD`         |
| parser          | Bedrock デフォルト parser                 |
| GenU の接続方法 | `parameter.ts` に既存 KB ID を固定指定    |

移行前 KB と関連リソースはロールバック用として保持し、この実装では更新・削除しない。

## 4. 目標構成

```text
PDF
  -> 専用 S3 バケット /docs/
  -> Bedrock Knowledge Base Data Source
       parser: BEDROCK_FOUNDATION_MODEL
       model: amazon.nova-lite-v1:0
       output: 文章 + Markdown 表 + 画像・グラフの説明文
  -> Titan Text Embeddings V2 (1024 dimensions)
  -> S3 Vectors (float32 / cosine)
  -> GenU RAG Chat / Use Case Builder (SEMANTIC search)
```

CDK が専用 S3 バケット、S3 Vector Bucket、Vector Index、Knowledge Base、Data Source、
サービスロールを作成し、Knowledge Base ID を GenU の API Lambda へスタック参照で渡す。

## 5. 変更内容

### 設定

- ベクトルストア種別 `OPENSEARCH_SERVERLESS` / `S3_VECTORS` を選択可能にする。
- 検索方式 `HYBRID` / `SEMANTIC` を選択可能にする。
- レポ内の既定 PDF をデータソースバケットへ自動配置するか設定可能にする。
- `dev` では S3 Vectors、`SEMANTIC`、Nova Lite parser、既定 PDF 自動配置なしを指定する。

### IAM

Knowledge Base のサービスロールへ、次の最小権限を付与する。

- 埋め込みモデルと Nova Lite に対する `bedrock:InvokeModel`
- Data Source バケットに対する `s3:ListBucket` / `s3:GetObject`
- 対象 S3 Vector Bucket / Index に対する vector の読み書き・検索権限

### データ解析

- 見出し、段落、脚注、ページ番号は文書の言語を維持して転記する。
- 表は列数とセル位置を可能な限り維持した Markdown 表へ変換する。
- 画像、図、グラフは、数値、軸、凡例、傾向、キャプションを含む検索可能な説明文へ変換する。
- 画像ファイル用の supplemental data storage は作成しない。

## 6. テスト

- 設定スキーマの既定値と列挙値を検証する。
- S3 Vectors 選択時に Vector Bucket / Index が生成され、OpenSearch Serverless が生成されないことを検証する。
- Data Source に Nova Lite の Foundation Model parser が設定されることを検証する。
- Knowledge Base ロールの S3、S3 Vectors、Bedrock 権限を検証する。
- API Lambda に `SEMANTIC` が渡り、Retrieve API で使用されることを検証する。
- OpenSearch Serverless の既存既定構成が維持されることをスナップショットで確認する。
- TypeScript、ESLint、Jest、CDK synth、CDK diff を実行する。

## 7. 移行手順

1. コードとテストを完了し、`cdk diff` で新規リソースと GenU 側の変更を確認する。
2. `RagKnowledgeBaseStackdev` だけを先にデプロイする。
3. スタック出力から Data Source バケット、Knowledge Base ID、Data Source ID を取得する。
4. 評価用 PDF を Data Source バケットの `docs/` にアップロードする。
5. ingestion job を手動起動し、`COMPLETE` になるまで確認する。
6. Bedrock の Retrieve API で文章、表、画像・グラフに関する質問を実行する。
7. 解析結果と引用を確認後、`GenerativeAiUseCasesStackdev` をデプロイして GenU を新 KB へ切り替える。
8. GenU の RAG チャットと Use Case Builder で受入確認する。

## 8. ロールバック

問題が発生した場合は `parameter.ts` の `ragKnowledgeBaseId` を `HO8P6XRCIE` に戻して
GenU スタックを再デプロイする。新旧 KB は移行中併存させ、旧 KB の削除は別作業とする。

## 9. コストと運用上の注意

- Foundation Model parser は入力・出力トークンに応じて課金され、PDF 同期のたびに解析費用が発生する。
- レポ内には大容量のサンプル PDF があるため、`dev` では自動配置を無効化する。
- S3 Vectors を使用することで OpenSearch Serverless の常時 OCU 課金を避ける。
- ingestion は自動化せず、対象 PDF と解析費用を確認してから手動実行する。

## 10. 受入基準

- 新 KB が東京リージョンで ACTIVE になる。
- ingestion job が失敗文書なしで完了する。
- 本文に関する質問へ正しい引用付き回答が返る。
- PDF 内の表が行・列の関係を保った検索用テキストとして取得できる。
- PDF 内の画像・グラフの内容が自然言語の説明として取得できる。
- GenU の RAG チャットと Use Case Builder が S3 Vectors の制約エラーなしで動作する。
- 既存 KB `HO8P6XRCIE` が変更されず、ロールバック可能な状態で残る。

## 11. 実施結果（2026-07-20）

| 項目                           | 結果                                                             |
| ------------------------------ | ---------------------------------------------------------------- |
| `RagKnowledgeBaseStackdev`     | `CREATE_COMPLETE`                                                |
| 新 Knowledge Base              | `generative-ai-use-cases-jpdev` / `JSODYFCDEY`（`ACTIVE`）       |
| Data Source                    | `HRMCUUIUWC`                                                     |
| Data Source バケット           | `ragknowledgebasestackdev-datasourcebucket9fa93e04-jnblitupbikr` |
| S3 Vector Bucket               | `generative-ai-use-cases-jpdev-vectors`                          |
| S3 Vector Index                | `bedrock-knowledge-base-default`                                 |
| `GenerativeAiUseCasesStackdev` | `UPDATE_COMPLETE`                                                |
| ロールバック用 KB              | `genu-manual-s3vectors-kb` / `HO8P6XRCIE`（`ACTIVE` のまま保持） |

日本語本文、複数階層・結合セルを持つ表、PNG画像を含む3ページの評価用PDFを `docs/` に
配置して手動同期した結果、1文書が失敗なしでインデックス化された。Retrieve APIで
`SEMANTIC` を指定した直接検索では、地域別指標、改善施策の計画・実績、サーモグラフィ画像の
ラック名・温度・位置を取得でき、いずれも元PDFのS3 URIとページ番号が付与された。

Nova Lite parser単体では画像をプレースホルダーとして出力し、画像内のラベルと値の対応説明が
欠落する場合がある。このため解析プロンプトで可視化の説明要件を強化するとともに、評価用PDFには
アクセシビリティ用の代替説明を併記した。最終確認ではラックC、38.6°C、上部という画像の意味を
引用付きで回答できた。

レポ内の 276 ページ PDF は Nova Lite parser のスロットリングにより 2 回失敗したため、
受入確認には小容量 PDF を使用した。大容量 PDF はページ分割または投入単位の縮小を行い、
同時実行を避けて段階的に同期する。失敗した文書にはインデックス登録が行われていない。

GenU デプロイ後、`ApiHandler` と `PredictStream` の両 Lambda で
`KNOWLEDGE_BASE_ID=JSODYFCDEY` および `KNOWLEDGE_BASE_SEARCH_TYPE=SEMANTIC` を確認した。
RAG チャットと同じ RetrieveAndGenerate API でも地域別指標と画像内ラック情報について、
元PDFの引用を含む回答を確認した。
ブラウザ画面の操作確認は Cognito ユーザーでログインし、RAG チャットと
`{{retrieveKnowledgeBase}}` を含む Use Case Builder から上記 3 種類の質問を実行する。

## 12. Claude Haiku 4.5 画像ブラインド評価（2026-07-20）

追加検証では Foundation Model parser を
日本地域の推論プロファイル `jp.anthropic.claude-haiku-4-5-20251001-v1:0` を介した
`anthropic.claude-haiku-4-5-20251001-v1:0` に変更する。評価用PDFから、画像外にあった
ラック名・温度・高温箇所の代替説明と、別ページにあった「ラックC上部」の記述を削除する。
ラック名、状態、温度、高温箇所の位置は、PDFに埋め込んだPNGの画素内だけに残す。
検索語との完全一致で順位を押し上げないよう、PDF内の質問例も削除する。
また、既定の約300トークンではラック見出しと温度が別チャンクに分断されたため、高度解析時は
固定長1500トークン・20%オーバーラップに変更し、ページ内の図表説明を一体で取得できるようにする。

再生成後は `pdftotext` の出力に `38.6`、`ラックC`、`上部に高温箇所` が含まれないことを
確認してからS3へ配置する。同期後はS3 Vectorsの `AMAZON_BEDROCK_TEXT` を直接確認し、
これらの値がHaiku 4.5の画像解析によって初めて抽出されたことを受入条件とする。

実施結果は次のとおり。

| 項目                 | 結果                                               |
| -------------------- | -------------------------------------------------- |
| Data Source          | `Z9WZZTL544`                                       |
| ingestion job        | `LRGMFCPS5Y` / `COMPLETE` / 1文書・失敗0件         |
| parser               | JP inference profile経由のClaude Haiku 4.5         |
| chunking             | 固定長1500トークン・20%オーバーラップ              |
| テキストレイヤー検査 | `ラックC`、`38.6`、`上部に高温箇所`はいずれも不在  |
| 画像抽出結果         | ラックC、38.6°C、赤色、高温箇所は上部を抽出        |
| RetrieveAndGenerate  | ラックC、38.6°C、上部と回答し、PDF 3ページ目を引用 |

対象のラックCについては画像だけから正しく読み取れた。一方で、小さい日本語ラベルの一部に
OCR誤りがあり、ラックBの状態「注意」と凡例の文字が別の文字列として出力される場合があった。
数値、色、位置、ラックとの対応は保持されたが、Haiku 4.5でも全ラベルが完全ではない点を
実運用時の品質評価項目に含める。
