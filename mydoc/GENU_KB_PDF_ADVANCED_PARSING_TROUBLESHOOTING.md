# GenU Knowledge Base PDF 高度解析：課題・原因・解決記録

## 1. この文書の目的

2026-07-20〜2026-07-21に実施した、GenUのPDF高度解析対応で発生した問題を記録する。
同じ問題が再発したときに、症状から原因、修正、確認方法へたどれることを目的とする。

実装の全体設計は
[GENU_KB_PDF_ADVANCED_PARSING_IMPLEMENTATION_PLAN.md](./GENU_KB_PDF_ADVANCED_PARSING_IMPLEMENTATION_PLAN.md)、
RAG方式の比較は[GENU_RAG_APPROACHES.md](./GENU_RAG_APPROACHES.md)を参照する。

## 2. 最終構成（記録時点）

| 項目           | 値                                             |
| -------------- | ---------------------------------------------- |
| リージョン     | `ap-northeast-1`（東京）                       |
| Knowledge Base | `generative-ai-use-cases-jpdev` / `JSODYFCDEY` |
| Vector Store   | S3 Vectors / float32 / 1024次元 / cosine       |
| Data Source    | `Z9WZZTL544` / S3の`docs/` prefix              |
| parser         | `BEDROCK_FOUNDATION_MODEL`                     |
| parser model   | `jp.anthropic.claude-haiku-4-5-20251001-v1:0`  |
| chunking       | 固定長1500トークン / 20%オーバーラップ         |
| 検索方式       | `SEMANTIC`                                     |
| 最新ingestion  | `VP86QYG8ID` / `COMPLETE` / 更新1件・失敗0件   |
| ロールバック先 | 旧KB `HO8P6XRCIE`                              |

Foundation Model parserは、画像ファイルを検索時に直接OCRする仕組みではない。ingestion時に
文章をテキスト、表をMarkdown、画像やグラフを説明文へ変換し、そのテキストを埋め込みにする。
この構成では抽出画像ファイル用のS3保存先は作っていない。

## 3. 課題一覧

| #   | 症状                                        | 原因                                               | 状態                         |
| --- | ------------------------------------------- | -------------------------------------------------- | ---------------------------- |
| 1   | parser変更なのに差分が大きい                | S3 Vectors化など、parser以外の要件も同時に実装した | 整理済み                     |
| 2   | 設定を有効にしても新KBが作られない          | `ragKnowledgeBaseId`指定時はKBスタックを作らない   | 解決済み                     |
| 3   | S3 Vectors検索がValidationExceptionになる   | `HYBRID`を指定していた                             | 解決済み                     |
| 4   | Haiku 4.5のData Source作成に失敗する        | 直接モデルARNではなくinference profileが必要       | 解決済み                     |
| 5   | parser設定変更時にData Source更新が失敗する | CloudFormationでは解析設定がReplacement            | 解決済み                     |
| 6   | Nova Liteが画像のラベルと値を結び付けない   | 画像説明がプレースホルダーまたは不十分             | Haikuへ変更                  |
| 7   | ラックCを読めてもブラインド評価にならない   | 画像外の本文・代替説明に正解が含まれていた         | 解決済み                     |
| 8   | ラック見出しと温度が別々に取得される        | チャンクが小さく図の説明が分割された               | 解決済み                     |
| 9   | 「注意」「高温」が別の漢字になる            | PNGがPDF内で横方向に約17.4%圧縮されていた          | 解決済み                     |
| 10  | 出典リンクでAccessDenied XMLが表示される    | 空のIP制限配列から常に失敗するIAM条件を作っていた  | 解決済み                     |
| 11  | PDF 3ページ目の出典が「2 page」になる       | Bedrockの0始まり値をそのまま表示した               | コード修正済み・未デプロイ   |
| 12  | CDK synthで`aws:///ap-northeast-1`エラー    | AWS profile未指定でaccountが空だった               | 手順化済み                   |
| 13  | 大容量PDFのingestionが失敗する              | parserのスロットリング                             | 分割ツールで解決             |
| 14  | 成功したはずのPDFが検索できない             | sidecarが1024バイトを超え、文書が黙って無視された  | 解決済み                     |
| 15  | 分割後もparserがスロットリングする          | クロスリージョン推論のリクエスト数が毎分10         | 8ページ/パートで解決         |
| 16  | 出典リンクのページとビューア表示が不一致    | 分割PDFへリンクし#page=が分割内ページだった        | 統合PDFへのリンクで解決      |
| 17  | 物理ページと印字ページがずれる              | PDFのPageLabelsで論理ページが別体系になっている    | 物理ページで統一（設計判断） |
| 18  | ページ番号が出ない文書で箇所を特定できない  | ページ番号はPDF専用でDOCX等では返らない            | 抜粋併記で解決               |

## 4. 各課題の詳細

### 4.1 parser変更だけのつもりが、多数のファイル変更になった

#### 結論

既存のCDK管理KBで、対応済みの直接モデルをparserに使うだけなら、中心となる変更は次の3点である。

1. `ragKnowledgeBaseAdvancedParsing: true`
2. parser model IDの指定
3. Data Sourceの再作成と再同期

今回の差分が大きくなったのは、実装計画に次も含めたためである。

- OpenSearch Serverless / S3 Vectorsの選択機能
- S3 Vector BucketとIndexのCDK化
- `HYBRID` / `SEMANTIC`の設定化とLambdaへの伝搬
- 既定PDFの自動配置制御
- Haiku 4.5 inference profile用IAM
- 日本語評価PDF、テスト、ドキュメント

parser変更自体と、ベクトルストアや検索方式の変更は別の論点として見積もる。

### 4.2 既存KB IDを指定すると、KB用CDKが動かない

当初の`dev`には次が設定されていた。

```typescript
ragKnowledgeBaseId: 'HO8P6XRCIE';
```

この値がある場合、GenUは既存KBを参照し、`RagKnowledgeBaseStack`を作らない。そのため、
同じ設定ブロックに`ragKnowledgeBaseAdvancedParsing: true`を加えても、既存Data Sourceは変わらない。

CDKで新KBを管理する最終構成では、`ragKnowledgeBaseId: null`としてスタックを作成した。
既存KBを維持する場合は、AWSマネコンまたはCLIで新しいData Sourceを追加するほうが変更は小さい。

### 4.3 BDAを東京で使えない

Amazon Bedrock Data Automation parserは、検証時点では`us-west-2`（オレゴン）のみ対応だった。
東京リージョンを維持するため、Foundation Model parserを採用した。

参考：[Supported models and Regions for parsing](https://docs.aws.amazon.com/bedrock/latest/userguide/knowledge-base-supported.html)

### 4.4 S3 Vectorsで`HYBRID`検索が失敗する

#### 症状

```text
ValidationException: HYBRID search type is not supported
```

#### 原因と修正

S3 Vectorsはセマンティック検索のみをサポートする。GenUにハードコードされていた`HYBRID`を
`ragKnowledgeBaseSearchType`から渡すようにし、`dev`では`SEMANTIC`を指定した。
RAGチャットと`{{retrieveKnowledgeBase}}`の両方へ同じ設定を適用する。

参考：[Using S3 Vectors with Amazon Bedrock Knowledge Bases](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-vectors-bedrock-kb.html)

### 4.5 Haiku 4.5を直接モデルARNとして指定できない

#### 症状

直接の`foundation-model/...` ARNでData Sourceを作成すると、オンデマンド呼び出しまたは権限で失敗した。

#### 原因

最終構成では日本地域のinference profileを使う必要がある。

```text
arn:aws:bedrock:ap-northeast-1:<account-id>:inference-profile/
  jp.anthropic.claude-haiku-4-5-20251001-v1:0
```

#### 必要なIAM

- inference profileへの`bedrock:GetInferenceProfile` / `bedrock:InvokeModel`
- 東京・大阪の基盤モデルへの`bedrock:InvokeModel`
- 基盤モデル権限には`bedrock:InferenceProfileArn`条件を付ける

inference profileは東京または大阪へ処理を振り分けるため、データが複数リージョンで処理され得る点も
設計時に確認する。

### 4.6 parser変更でData Sourceが置換される

CloudFormationの`AWS::Bedrock::DataSource`では、`ParsingConfiguration`や
`ChunkingConfiguration`の変更はReplacementになる。固定名のままcreate-before-deleteすると
名前衝突する可能性があるため、parser・prompt・chunkingから算出したハッシュをData Source名に付けた。

```text
s3-data-source-<config-hash>
```

Data Sourceが変わるたびにIDも変わる。運用手順やマネコンの確認対象は、CloudFormation出力の
最新Data Source IDを使う。

### 4.7 内部メタデータが見えなくても精度が上がる理由

精度改善の主因は、利用者が付けるsidecar metadataではない。Foundation Model parserが
画像・表を検索可能なテキストへ変換し、その内容が埋め込み対象になるためである。

Retrieve APIでは次のようなシステムメタデータを確認できる。

```json
{
  "x-amz-bedrock-kb-document-page-number": 2.0,
  "x-amz-bedrock-kb-data-source-id": "Z9WZZTL544",
  "x-amz-bedrock-kb-source-file-modality": "TEXT"
}
```

`2.0`は今回のPDFでは3ページ目を表す0始まりのインデックスだった。利用者が作成する
`.metadata.json`が無いことと、parserが生成する検索テキストやシステムメタデータが無いことは同義ではない。

AWSマネコンのKnowledge Baseテスト画面では引用元を確認できるが、raw metadataの全フィールドが
常に表示されるとは限らない。ページインデックスを含む内部値を確実に確認する場合は、Retrieve APIを
AWS CLIまたはSDKから呼び出してレスポンスJSONを確認する。

### 4.8 Nova Liteでは画像の対応関係が欠落した

Nova Liteの初期評価では文章とMarkdown表を取得できたが、画像内のラック名、状態、温度、位置の
対応説明が欠落する場合があった。解析promptを詳細化しても十分でなかったため、最終的にHaiku 4.5へ変更した。

モデルを変更するだけで必ずOCR精度が上がるわけではない。画像の縦横比、画素数、レイアウト、
チャンク分割、promptを合わせて評価する。

### 4.9 ブラインド評価で正解が画像外に漏れていた

初期PDFにはアクセシビリティ用の代替説明や、別ページの本文に「ラックC上部」などの正解があった。
この状態では画像を読まずに回答できるため、画像解析の評価にならない。

最終PDFでは次を削除した。

- ラック名、温度、高温箇所を再掲する本文・代替説明
- 別ページの「ラックC上部」という記述
- 検索語と完全一致する質問例

PDFテキストレイヤーに`ラックC`、`38.6`、`上部に高温箇所`が無いことをPDFKitで確認した。
これらは埋め込みPNGの画素内にだけ存在する。

### 4.10 図表説明が小さいチャンクに分断された

既定の小さいチャンクでは、ラック見出し、状態、温度、位置説明が別チャンクになり、検索時に
対応関係が失われた。高度解析時は固定長1500トークン、20%オーバーラップに変更し、1ページの
図表説明を一体で取得できるようにした。

S3 Vectorsでは階層チャンクは推奨されていないため、固定長を採用した。

### 4.11 PNGの縦横比が壊れ、日本語を誤読した

#### 原因となった値

- 元PNG：1200×680 px、縦横比1.765
- PDF配置枠：510×350 pt、縦横比1.457
- 横倍率：`510 / 1200 = 0.425`
- 縦倍率：`350 / 680 = 0.515`
- 横方向は縦方向に対して約17.4%圧縮

`NSImage.draw(in:)`が縦横別倍率で画像を枠へ押し込んだことが原因だった。

#### 修正

- PDF配置枠は510×350 ptのまま
- PNGを991×680 pxへ変更
- フォントサイズは変更しない
- ラック間隔を画像幅から計算
- 凡例を下部へ再配置し、ラックEとの重なりを解消

修正後は横倍率0.514632、縦倍率0.514706、差0.0144%となった。再ingestion後、以前誤読した
ラックBの「注意」と凡例の「正常・注意・高温」を正しく抽出できた。

#### 誤った仮説と採用しなかった対応

- 「17 pxがPDF内で約7 pt」は横倍率だけで高さを計算した誤り。縦方向では約8.75 ptだった。
- 36〜48 pxへの拡大案は、このPDFの実寸に対して過大だったため採用しなかった。
- AWSはFoundation Model parser内部のページ画像化・リサイズ条件を公開していない。
  「Haikuへ渡すときに必ずさらに縮小される」とは断定しない。
- まず入力画像の幾何学的な歪みを直し、それでも文字誤りが残る場合に専用OCRを検討する。

### 4.12 出典リンクがAccessDenied XMLになる

#### 症状

出典リンクを開くと、S3のXMLで`AccessDenied`が表示された。

#### 原因

IPv4/IPv6許可範囲が空配列でもJavaScript上はtruthyであるため、空の`aws:SourceIp`条件を
IAMポリシーへ付けていた。この条件にはどの送信元IPも一致せず、`s3:GetObject`が許可されなかった。

#### 修正

IPv4/IPv6を結合した配列の`length`が0なら条件自体を付けないようにした。空配列、IPv4のみ、
IPv6のみ、両方のテストを追加した。

### 4.13 PDF 3ページ目が「2 page」と表示された

#### 切り分け

Retrieve結果の本文にはラックC、38.6°C、上部、文書内の`3 / 3`が含まれていた。検索チャンクは
正しく3ページ目だった。一方、メタデータは次だった。

```json
"x-amz-bedrock-kb-document-page-number": 2.0
```

問題は検索ではなく、0始まりページインデックスを表示層がそのまま使ったことだった。リンクの
`#page=2`もPDFビューアでは2ページ目を開く。

#### 修正

共通関数`toOneBasedPageNumber`で、表示とPDF URLの両方を1始まりへ変換した。

```text
0 -> 1 page / #page=1
2.0 -> 3 page / #page=3
```

Knowledge Base、旧Retrieve経路、Bedrock Agentへ適用した。Kendraの既存ページ番号には適用しない。
不正値を含む17件の境界値テストと、模擬`RetrievedReference`から次を生成する統合テストを追加した。

```markdown
[^0]: [genu-advanced-parsing-ja-sample(3 page)](...pdf#page=3)
```

記録時点ではコミット`257cd70f`まで完了しているが、AWSの`dev`環境には未デプロイである。

### 4.14 大容量PDFでparserがスロットリングした

レポ内の276ページPDFは、Nova Lite parserで2回スロットリングした。失敗文書はインデックス登録
されなかった。高度解析は全PDFページに対してモデル料金とクォータを消費する。

運用では次を行う。

- デフォルト文書の自動配置を`false`にする
- 対象PDFを確認して`docs/`へ手動配置する
- 小さい評価PDFで品質を確認してから本番PDFを同期する
- 大容量PDFは分割または投入単位を縮小する
- ingestion jobを同時に多数実行しない

### 4.15 AWS SSOとCDKコマンドの実行条件

SSOトークンが失効すると、AWS CLIは次で失敗する。

```text
Error when retrieving token from sso: Token has expired
```

再ログインする。

```bash
aws sso login --profile rag-poc-admin
```

CDK synthでprofileを付けないとaccountが空になり、次のようなエラーになった。

```text
Unable to parse environment specification "aws:///ap-northeast-1"
```

次のようにprofileを明示する。

```bash
cd packages/cdk
AWS_PROFILE=rag-poc-admin npx cdk synth -c env=dev --quiet
```

`cdk diff`では`cdk-remote-stack`の`randomString`やWebビルドアセットのハッシュが変わることがある。
Knowledge Baseスタックの実差分と、生成時ノイズを分けて確認する。

## 5. 検証コマンド

### PDFテキストレイヤー

PDFKitで3ページ目のテキストを取り出し、ブラインド評価の正解が含まれないことを確認する。
生成元は[generate_advanced_parsing_ja_sample.swift](./generate_advanced_parsing_ja_sample.swift)である。

### Knowledge Baseの直接検索

```bash
aws bedrock-agent-runtime retrieve \
  --knowledge-base-id JSODYFCDEY \
  --retrieval-query '{"text":"ラックCの温度と高温箇所を教えて"}' \
  --retrieval-configuration \
    '{"vectorSearchConfiguration":{"numberOfResults":3,"overrideSearchType":"SEMANTIC"}}' \
  --region ap-northeast-1 \
  --profile rag-poc-admin
```

確認項目：

- 本文に`ラックC`、`38.6°C`、`上部`がある
- source URIが評価PDFを指す
- raw page metadataは`2.0`
- GenU表示では変換後の`3 page`、リンクでは`#page=3`になる

### ローカルテスト

```bash
cd packages/cdk
npm run build
npx jest --runInBand \
  test/common/bedrock-kb-page-number.test.ts \
  test/lambda/utils/bedrockKbCitation.test.ts
```

### CDK検証

```bash
cd packages/cdk
AWS_PROFILE=rag-poc-admin npx cdk synth -c env=dev --quiet
AWS_PROFILE=rag-poc-admin npx cdk diff \
  RagKnowledgeBaseStackdev GenerativeAiUseCasesStackdev \
  -c env=dev --no-change-set
```

## 6. 残っている注意点

1. 出典ページ補正はコミット済みだが、記録時点ではAWSへ未デプロイである。
2. 評価画像の凡例は文字列全体を白色で描画しているため、丸印自体も白い。parserが返した
   緑・オレンジ・赤はラック上の色付き領域から推論したものである。凡例の色認識を評価する場合は、
   丸印を実際の3色で別々に描画する。
3. parser promptで文書と同じ言語を指定しても、画像説明の一部が英語になる場合がある。
4. 今回の成功は小容量3ページPDFでの結果であり、276ページPDFの安定処理を保証しない。
5. 小さい日本語の逐語OCRが重要な場合は、入力画像の歪みを直したうえで、PaddleOCRなどとの
   ハイブリッド構成を別途比較する。Amazon Textractは日本語OCR用途には適さない。

## 7. 関連ファイル

| ファイル                                                         | 役割                                           |
| ---------------------------------------------------------------- | ---------------------------------------------- |
| `packages/cdk/parameter.ts`                                      | `dev`のKB、parser、検索方式設定                |
| `packages/cdk/lib/rag-knowledge-base-stack.ts`                   | S3 Vectors、Data Source、parser、IAM、chunking |
| `packages/cdk/lambda/utils/bedrockKbApi.ts`                      | Knowledge Baseの回答と出典生成                 |
| `packages/cdk/lambda/utils/bedrockAgentApi.ts`                   | Bedrock Agentの出典生成                        |
| `packages/common/src/application/bedrock-kb-page-number.ts`      | 0始まりページ番号の共通補正                    |
| `packages/cdk/lambda/utils/bedrockKbCitation.ts`                 | PDF URLと脚注Markdown生成                      |
| `mydoc/generate_advanced_parsing_ja_sample.swift`                | 日本語評価PDF生成                              |
| `packages/cdk/rag-docs/docs/genu-advanced-parsing-ja-sample.pdf` | 評価用PDF                                      |

## 8. 関連コミット

| Commit     | 内容                                                    |
| ---------- | ------------------------------------------------------- |
| `287a8d71` | Foundation Model parser、S3 Vectors、Haiku 4.5、評価PDF |
| `83998d58` | 最終検証結果と縦横比修正のドキュメント反映              |
| `257cd70f` | 出典ページ番号の0始まりから1始まりへの補正              |

### 4.16 sidecarが1024バイトを超え、PDFが黙って無視された

分割したPDFとsidecarを投入したところ、ingestion jobは`COMPLETE`になったが1件もインデックス
されなかった。`numberOfDocumentsFailed`は0のままで、`failureReasons`にだけ理由が出ていた。

```text
Ignored 3 files as the associated metadata was larger than
service limit of MaximumFileSizeSupported: 1024 bytes
```

AWSのドキュメントには「メタデータファイルは10 KBまで」と記載されているが、実際に適用された
上限は**1024バイト**である。実測値を正とする。

さらに問題なのは、超過した文書が失敗として計上されない点である。ジョブは成功扱いで終わるため、
`failureReasons`を確認しない限り気づけない。投入ツールは次をすべてエラーとして扱う。

- `status`が`COMPLETE`以外
- `numberOfDocumentsFailed > 0`
- `failureReasons`が空でない
- インデックス件数が0

拡張形式（`value` / `includeForEmbedding`）は属性あたり約60バイトの定型部分を持つため、
19属性ではminifyしても1,971バイトになり上限に収まらない。

| 形式                     | サイズ  | 判定 |
| ------------------------ | ------- | ---- |
| 拡張形式・整形あり       | 3,046 B | 超過 |
| 拡張形式・minify         | 1,971 B | 超過 |
| 簡易形式・minify         | 624 B   | 可   |
| 混在形式・minify（採用） | 693 B   | 可   |

簡易形式は`includeForEmbedding: false`と等価になるため、そのままでは`document_title`を
Embeddingへ含める設計を満たせない。そこで**同一ファイル内で両形式を混在**させ、
`document_title`だけを拡張形式、残りを簡易形式で書く方式を採用した。

1ページPDF 2本で実地検証し、混在形式が受理されること、`document_title`の
`includeForEmbedding: true`が保持されることを確認した。Retrieveのレスポンスでは
`original_page_start`、`original_page_end`、`part_number`、`document_title`、
`original_file_name`がいずれも返る。

sidecarは整形せずminifyし、末尾の改行も付けない。

### 4.17 分割してもparserがスロットリングした

55ページのパートを投入したところ、次の理由で失敗した。

```text
Ignored 1 files as the foundation model used for parsing was throttled.
```

原因は**リクエスト数**のクォータである。

| クォータ                                                          | 値        |
| ----------------------------------------------------------------- | --------- |
| Cross-region model inference **requests** per minute（Haiku 4.5） | **10**    |
| Cross-region model inference tokens per minute（Haiku 4.5）       | 5,000,000 |

`jp.`推論プロファイルはクロスリージョン扱いとなり、**PDF 1ページ = 1リクエスト**を消費する。
トークンは潤沢だがリクエスト数が毎分10で頭打ちになるため、1ジョブへ多数のページを投入すると
必ず溢れる。3ページの評価用PDFが成功していたのは、この範囲に収まっていたからである。

対処の方向は2つある。

1. 1パートあたりのページ数を10未満にし、ジョブ間隔を60秒以上あける
2. Service QuotasでCross-region requests per minuteの引き上げを申請する

本番運用では2が本筋であり、1は申請なしで進める場合の回避策である。

実際に**8ページ/パート**へ再分割し、ジョブ間隔を30秒以上あけて141ページ（18パート）を
逐次投入したところ、全パートが`indexed 1`・失敗0で完了した。マニフェストの`pages_per_part`を
8に設定して回避した。

### 4.18 出典リンクのページ番号がPDFビューアの表示と一致しない

分割PDFを検索対象にすると、Bedrockが返すページ番号は分割PDF内のページになる。出典ラベルは
`original_page_start`から原本ページへ補正できていたが、**出典リンクは分割PDF自身を指し、
`#page=`には分割PDF内のページ**が入っていた。このため、ラベルは「119 page」なのに、開いた
分割PDF（8ページ）のビューア表示は「7/8」となり一致しなかった。8ページしかないPDFでは、
それが原本のどこなのかも分かりにくい。

#### 調査したベストプラクティス

RAGの一般的な作法では、分割・チャンク化は取り込みの都合であり、ユーザーに見せる引用は
原本文書＋原本ページで原本そのものを指すべきとされる。各チャンクに source document identifier と
page number をメタデータで持たせ、原本へリンクバックする。メタデータ定義の`original_file_name`と
`original_page_start`はこの原則に沿っており、リンク生成を原本へ向けるだけでよい。

#### 対処

分割前の統合PDFを、データソースの`inclusionPrefixes`（`docs/`）の外にある`originals/`へ配置する。
この prefix は解析対象外なので、統合PDFは配信されるが再解析・再課金されない。出典リンクは
`buildBedrockKbReferenceTarget`で次のように生成する。

- 分割文書（`original_page_start`あり）→ `originals/<original_file_name>#page=<原本物理ページ>`
- 未分割PDF → 従来どおり自ファイル`#page=<物理ページ>`
- `original_file_name`が無い、またはバケットのベースURLを復元できない場合は分割PDFへフォールバック

これにより、ラベル・ビューアのページ表示・リンク先が原本物理ページで一致する。

配信のアクセス制御は`docs/`と同一である。データソースバケットへのIAM付与は
`s3-access-policy.ts`で`arn:aws:s3:::<bucket>/*`（バケット全体）に対して行われ、
`originals/`も同じ presign 経路で配信できる。CDKの変更は不要で、Lambdaの再デプロイだけで反映される。

### 4.19 物理ページと印字（論理）ページのずれ

統合PDFへリンクしても、PDFに印刷されたページ番号（フッター）と物理ページ（ファイル先頭からの
位置）が一致しない場合がある。評価に使った`bedrock-ug.pdf`には**PDF Page Labels**が設定されており、

| 物理ページ | ラベル体系       | 印字ラベル          |
| ---------- | ---------------- | ------------------- |
| 1〜9       | 小文字ローマ数字 | i〜ix（表紙・目次） |
| 10以降     | 10進数 start=1   | 1, 2, …             |

物理ページ = 印字ページ + 9 となる。Bedrockが返すのは常に物理ページである。

#### 設計判断：物理ページで統一する

論理（印字）ページへ変換するには PageLabels 番号ツリーを解釈する必要があるが、次の理由で採用しない。

- PageLabels が意味を持つのは「PageLabels 付き PDF」だけで、未設定PDF・DOCX・印字なしPDFでは
  無意味か、かえって誤ったラベルを生む。文書タイプごとに挙動が分岐し一貫性が崩れる。
- `#page=`は物理ページしか指定できない（論理ページを指す標準URL構文は存在しない）。
- Chrome/Acrobatは PageLabels があるとビューアのページ欄に論理ラベルを表示する。したがって
  統合PDFに PageLabels が**無ければ**、ビューアは物理ページを表示し、出典ラベル（物理）と一致する。

分割時に使う`pdf-lib`の`copyPages`は PageLabels を引き継がないため、統合PDFとして配信する
分割元（例：141ページへトリムした`bedrock-ug-half.pdf`）には PageLabels が付かない。結果として
ビューアは物理ページを表示し、ラベル・ビューア・`#page=`が物理ページで三者一致する。

将来 PageLabels 付き PDF が主要文書になった場合は、物理→論理変換を純粋関数として追加できる形に
留めてある。現時点では実装しない。

### 4.20 ページ番号が返らない文書での箇所特定

`x-amz-bedrock-kb-document-page-number`は**PDF専用**であり、DOCX・txt・html等では返らない
（AWSの記述は常に「If you have PDF documents…」と条件付き）。加えてDOCXはページ境界が表示環境で
変わり、`#page=`もブラウザで効かない（ダウンロードされWordで開く）。このためページ番号だけに
依存すると、これらの文書では出典が文書名までしか特定できない。

#### 対処：チャンク抜粋を併記する

Retrieveの各参照は、ページ番号とは独立に`content.text`（ヒットしたチャンク本文）を返す。これを
`buildBedrockKbSnippet`で1行へ整形（改行・マークダウン記号・脚注を壊す文字を除去し、冒頭を
省略記号付きで切り詰め）し、出典脚注に併記する。ページ番号の有無に関わらず箇所の手がかりになり、
DOCX等でも「文書名だけ」で終わらない。ユーザーは抜粋を読むか、文書内をテキスト検索して辿れる。

副次的に、PDFではparserがフッターの印字ページ番号を本文へ抽出していることが分かった（抜粋末尾に
「ページ番号: 126」等が現れる。物理135 − 9 = 論理126でPageLabelsと一致）。論理ページが必要に
なった場合の手がかりになるが、全ページで確実ではないため現時点では使わない。

#### 脚注の改行

抜粋を出典タイトルと同じ行に置くと、文書名と抜粋の区別が付きにくい。GenUのMarkdownは
`remark-gfm`＋`remark-breaks`で描画するため、脚注定義内の単一改行が`<br>`へ変換される。これを
実際のプラグイン構成で描画確認し、`formatBedrockKbFootnote`が出典リンクと抜粋の間に改行を
入れるようにした。タイトル＋ページが1行目（リンク）、抜粋が2行目に表示される。

なお脚注末尾の`↩`（および複数引用時の`↩²`）は`remark-gfm`が生成する「本文の引用箇所へ戻る」
リンクであり、標準機能として残している。矢印自体の除去にはフロント改修が必要になる。

これらの出典生成の変更はすべてLambda側（`bedrockKbCitation.ts`／`bedrockKbApi.ts`／
`bedrockAgentApi.ts`）で完結し、GenUのフロントエンドは無改修である。出典はLambdaがMarkdown文字列
として生成し、フロントの`Markdown.tsx`は汎用レンダラとして描画するだけであるため。
