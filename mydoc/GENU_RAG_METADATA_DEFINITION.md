# GenU RAG メタデータ定義

## 1. 目的

この文書は、GenU から Amazon Bedrock Knowledge Bases を利用する際の文書メタデータを定義する。

メタデータの用途は、次の範囲に限定する。

1. エンドユーザーによる検索対象の絞り込み
2. 組織、部署、職務によるアクセス制御
3. 文書の版管理と失効管理
4. 回答に対する出典、原本、ページ番号の提示
5. 大容量 PDF を分割した場合の原本ページ追跡
6. メタデータ定義自体の変更管理

将来利用する可能性だけを理由に項目を増やさない。Amazon Bedrock が内部生成する情報や、CDK で一元管理できる設定も文書メタデータへ重複して保存しない。

## 2. 前提

- PDF は PDF のまま、DOCX は DOCX のまま Knowledge Base へ登録する。
- すべての文書は、システムに登録された組織の構成員向けであり、一般公開しない。
- 組織の公開範囲は「全組織共通」または「1 つの組織内」に限定する。
- 組織 A と組織 B だけに公開するような、任意の複数組織指定は行わない。
- 部署は組織内のフラットな単位として扱い、部署の親子関係は管理しない。
- 同一組織内では、単一部署限定と複数部署共用を扱う。
- アクセス制御は LLM に判断させず、認証済みユーザーの属性から API が検索フィルターを強制する。
- メタデータファイルは、対象ファイルと同じ S3 フォルダーへ `<元ファイル名>.metadata.json` の名前で配置する。

## 3. 設計方針

### 3.1 文書レベルとチャンクレベルを分離する

この文書で定義する sidecar metadata は、原則として文書レベルの情報である。Amazon Bedrock は sidecar metadata を、その文書から生成した各チャンクへ付与する。

次の情報は Amazon Bedrock が内部管理するため、sidecar metadata には定義しない。

- `chunk_id`
- `chunk_index`
- `page_number`
- `section_id`
- `section_title`

検索結果のページ番号と S3 URI は、Amazon Bedrock が返すシステムメタデータを利用する。

大容量 PDF を事前に複数の PDF へ分割した場合だけ、元 PDF のページへ戻すための情報を条件付きで追加する。

### 3.2 ID と列挙値を標準化する

- メタデータのキーは英小文字の `snake_case` とする。
- 組織、部署、職務には表示名ではなく変更されにくい ID を使用する。
- ID と固定値は原則として半角英数字と `_`、`-`、`:`で構成する。
- ファイル拡張子は小文字、先頭のドットなしとする。
- 日付は `YYYYMMDD` の NUMBER とする。
- 自由記述が不要な項目は固定値から選択する。

### 3.3 検索用情報と制御用情報を分離する

`document_title`だけを原則として Embedding に含める。組織、部署、職務、版、状態、日付、URL などは検索フィルターまたは表示に利用し、Embedding には含めない。

アクセス制御項目を Embedding に含めてもアクセス制御にはならない。アクセス可否は、Retrieve 実行時のメタデータフィルターと IAM で強制する。

## 4. メタデータ定義表

「条件付き」は、条件に該当する文書だけに設定する。該当しない場合は `null`やダミー値を設定せず、項目自体を省略する。

| 分類           | 項目名                    | AWS 型      | 必須       | 仮の値                                                  | Embedding | 必要な理由・説明                                                                                       |
| -------------- | ------------------------- | ----------- | ---------- | ------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| スキーマ       | `metadata_schema_version` | NUMBER      | 必須       | `1`                                                     | 含めない  | メタデータ形式を将来変更した際に、旧形式と新形式を識別するため。破壊的変更時に整数を増やす。           |
| 文書           | `document_id`             | STRING      | 必須       | `OPS-MANUAL-001`                                        | 含めない  | 文書を一意に識別する不変 ID。版が変わっても同じ値を使用し、ファイル名を ID にしない。                  |
| 文書           | `document_title`          | STRING      | 必須       | `設備障害対応マニュアル`                                | 含める    | 画面表示、検索、出典名に使用する。各チャンクとタイトルの関係を検索へ反映するため Embedding に含める。  |
| 文書           | `document_type`           | STRING      | 必須       | `MANUAL`                                                | 含めない  | マニュアル、規程、手順書、報告書などで検索対象を明示的に絞るため。                                     |
| 文書           | `language`                | STRING      | 条件付き   | `ja`                                                    | 含めない  | 複数言語の文書を同じ Knowledge Base で扱う場合に検索対象を絞るため。全件日本語なら省略できる。         |
| 版管理         | `version`                 | STRING      | 必須       | `1.2`                                                   | 含めない  | 回答がどの版を根拠にしたかを表示し、旧版と現行版を区別するため。                                       |
| 版管理         | `supersedes_version`      | STRING      | 条件付き   | `1.1`                                                   | 含めない  | 新版が置き換えた旧版を明示するため。旧版を保持しない、または履歴を別システムで管理する場合は省略する。 |
| 版・失効       | `status`                  | STRING      | 必須       | `ACTIVE`                                                | 含めない  | 公開前、有効、旧版、期限切れ、緊急失効を区別し、検索対象外の文書を確実に除外するため。                 |
| 日付           | `published_at`            | NUMBER      | 条件付き   | `20260625`                                              | 含めない  | 文書の公開日を表示、検索する必要がある場合に使用する。有効開始日とは別の概念。                         |
| 日付           | `effective_from`          | NUMBER      | 必須       | `20260701`                                              | 含めない  | 文書を検索対象にできる最初の日を判定するため。日付は範囲の開始を含む。                                 |
| 日付           | `effective_to`            | NUMBER      | 必須       | `99991231`                                              | 含めない  | 文書を検索対象にできる最後の日を判定するため。日付は範囲の終了を含み、無期限は `99991231` とする。     |
| 所有者         | `owner_organization_id`   | STRING      | 必須       | `ORG_A`                                                 | 含めない  | 文書を管理、発行する組織を特定するため。閲覧可能範囲とは分けて管理する。                               |
| 所有者         | `owner_department_id`     | STRING      | 条件付き   | `IT_OPERATIONS`                                         | 含めない  | 文書の管理責任を持つ部署を特定するため。組織直轄文書など、所有部署がない場合は省略する。               |
| 組織・部署権限 | `allowed_group_ids`       | STRING_LIST | 必須       | `["org:ORG_A"]`                                         | 含めない  | 文書を参照できる組織または部署を検索前に限定するため。個人 ID ではなくグループ単位で管理する。         |
| 職務権限       | `allowed_role_ids`        | STRING_LIST | 必須       | `["ANY_ROLE"]`                                          | 含めない  | 一般職、管理職、承認者、監査担当などで参照範囲を分けるため。職務制限がない場合も予約値を明示する。     |
| 出典           | `original_file_name`      | STRING      | 必須       | `設備障害対応マニュアル.pdf`                            | 含めない  | 利用者に原本名を提示し、分割後も分割前のファイル名を維持するため。                                     |
| 出典           | `file_extension`          | STRING      | 必須       | `pdf`                                                   | 含めない  | PDF、DOCX などのファイル形式で検索、集計、表示を行うため。ファイル名の解析に依存しない。               |
| 出典           | `source_url`              | STRING      | 条件付き   | `https://documents.example.com/docs/OPS-MANUAL-001/1.2` | 含めない  | 文書管理システムなどの正式な原本へ利用者を案内するため。正式 URL がない場合は省略する。                |
| 監査           | `content_hash`            | STRING      | 条件付き   | `sha256:0123456789abcdef...`                            | 含めない  | 原本の同一性確認、重複検出、更新判定に使用する。取り込み処理で自動生成できる場合に設定する。           |
| PDF 分割       | `part_number`             | NUMBER      | PDF 分割時 | `2`                                                     | 含めない  | 分割ファイルの順序を特定するため。1 始まりとする。未分割 PDF と DOCX では項目を省略する。              |
| PDF 分割       | `original_page_start`     | NUMBER      | PDF 分割時 | `51`                                                    | 含めない  | 分割ファイルの 1 ページ目が元 PDF の何ページかを特定し、出典ページを補正するため。                     |
| PDF 分割       | `original_page_end`       | NUMBER      | PDF 分割時 | `100`                                                   | 含めない  | 分割ファイルが元 PDF のどのページまで含むかを検証、表示するため。                                      |

## 5. 固定値の定義

### 5.1 `document_type`

| 値          | 日本語名     | 想定する文書                           |
| ----------- | ------------ | -------------------------------------- |
| `MANUAL`    | マニュアル   | 製品、設備、システムなどの説明書       |
| `POLICY`    | 規程・方針   | 社内規程、運用方針、ガイドライン       |
| `PROCEDURE` | 手順書       | 作業手順、申請手順、障害対応手順       |
| `REPORT`    | 報告書       | 月次報告、調査報告、分析報告           |
| `FORM`      | 申請書・様式 | 記入用紙、テンプレート、チェックシート |
| `OTHER`     | その他       | 上記に分類できない文書                 |

値の追加は可能だが、同じ意味の値を複数作らない。例えば `MANUAL` と `GUIDE` の使い分けが定義できない場合は、どちらかへ統一する。

### 5.2 `status`

| 値           | 意味           | 通常検索           | 日付との関係                                                           |
| ------------ | -------------- | ------------------ | ---------------------------------------------------------------------- |
| `DRAFT`      | 公開前         | 対象外             | `effective_from`が未来でも、公開承認までは検索させない。               |
| `ACTIVE`     | 有効           | 有効期間内のみ対象 | `effective_from`以上、`effective_to`以下の場合だけ検索する。           |
| `SUPERSEDED` | 新版に置換済み | 対象外             | 原則として新版の有効開始日の前日を`effective_to`にする。               |
| `EXPIRED`    | 通常の期限切れ | 対象外             | 設定済みの`effective_to`経過後に管理状態を更新する。                   |
| `REVOKED`    | 緊急失効       | 対象外             | 事故や誤登録などで即時停止する。`effective_to`も最終有効日に更新する。 |

同じ`document_id`について、`ACTIVE`にできる版は原則 1 つだけとする。このルールにより、別途`is_current`を持たせない。

`effective_to`は最終有効日を含む。例えば 2026 年 7 月 31 日まで有効な場合は`20260731`を設定し、2026 年 8 月 1 日から検索対象外になる。

### 5.3 `allowed_group_ids`

| 公開範囲                | 設定例                                          | 説明                                                                             |
| ----------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------- |
| 組織共通                | `["common"]`                                    | システムを利用できる、いずれかの組織の構成員が参照できる。一般公開を意味しない。 |
| 組織 A 内               | `["org:ORG_A"]`                                 | 組織 A の全部署が参照できる。                                                    |
| 組織 A の営業部         | `["dept:ORG_A:SALES"]`                          | 組織 A の営業部だけが参照できる。                                                |
| 組織 A の複数部署で共用 | `["dept:ORG_A:SALES", "dept:ORG_A:ACCOUNTING"]` | 列挙した部署のいずれかに所属する利用者が参照できる。                             |

次の形式は使用しない。

```json
["org:ORG_A", "org:ORG_B"]
```

組織レベルの範囲は「組織共通」または「1 つの組織内」の二択とする。

組織 A の営業部に所属する利用者について、API は認証済み属性から次のグループ ID を生成する。

```text
common
org:ORG_A
dept:ORG_A:SALES
```

文書の`allowed_group_ids`と利用者のグループ ID が 1 つ以上一致した場合だけ、組織・部署条件を満たす。

`common`は外部公開を意味しない。未認証ユーザー、または有効な組織 ID を持たないユーザーには`common`を付与せず、検索 API の利用自体を拒否する。

### 5.4 `allowed_role_ids`

| 値         | 意味               |
| ---------- | ------------------ |
| `ANY_ROLE` | 職務による制限なし |
| `MEMBER`   | 一般職             |
| `MANAGER`  | 管理職             |
| `APPROVER` | 承認者             |
| `AUDITOR`  | 監査担当           |

設定例は次のとおり。

| 参照可能者         | 設定値                    |
| ------------------ | ------------------------- |
| 職務制限なし       | `["ANY_ROLE"]`            |
| 管理職のみ         | `["MANAGER"]`             |
| 承認者のみ         | `["APPROVER"]`            |
| 管理職または承認者 | `["MANAGER", "APPROVER"]` |

利用者側の仮の職務 ID は次のようにする。

```text
一般職         = ["MEMBER"]
管理職         = ["MEMBER", "MANAGER"]
承認者         = ["MEMBER", "APPROVER"]
管理職兼承認者 = ["MEMBER", "MANAGER", "APPROVER"]
```

管理職にも`MEMBER`を付与することで、一般職向け文書と管理職向け文書の両方を参照できる。

`allowed_role_ids`は必須とし、空配列を禁止する。職務制限がない場合は`["ANY_ROLE"]`を使用する。`ANY_ROLE`と他の職務 ID の併記は禁止する。

## 6. 未分割ファイルと分割 PDF

### 6.1 未分割 PDF

通常の未分割 PDF では、次の 3 項目をメタデータファイルに記載しない。

```text
part_number
original_page_start
original_page_end
```

Amazon Bedrock が返すページ番号を、そのまま原本のページ番号として使用する。

### 6.2 DOCX

DOCX はページの境界が表示環境によって変わる可能性があるため、現行設計では PDF 分割用の 3 項目を設定しない。

### 6.3 分割 PDF

大容量 PDF を事前分割した場合は、3 項目をすべて設定する。

例えば、元 PDF の 51～100 ページを分割した 2 番目の PDF は次の値になる。

```json
{
  "part_number": 2,
  "original_page_start": 51,
  "original_page_end": 100
}
```

アプリケーションが Bedrock の分割 PDF 内ページを 1 始まりへ正規化した後、元 PDF のページ番号を次の式で算出する。

```text
元PDFページ = original_page_start + 分割PDF内ページ - 1
```

3 項目の一部だけが存在する状態は禁止する。

| 状態                        | 判定                     |
| --------------------------- | ------------------------ |
| 3 項目すべてなし            | 未分割ファイルとして正常 |
| 3 項目すべてあり            | 分割 PDF として正常      |
| 1 項目または 2 項目だけあり | メタデータエラー         |

## 7. 検索時の強制条件

通常検索では、API が概念的に次の条件を必ず適用する。

```text
status = ACTIVE
AND effective_from <= 今日
AND effective_to >= 今日
AND 文書のallowed_group_idsと利用者のグループIDが1つ以上一致
AND (
  文書のallowed_role_idsにANY_ROLEが含まれる
  OR 文書のallowed_role_idsと利用者の職務IDが1つ以上一致
)
```

エンドユーザーが画面で組織、部署、文書種別、版などを選択する場合、その条件は上記の強制条件へ`AND`で追加し、検索範囲を狭める用途だけに使用する。画面から送信された値で強制条件を置き換えない。

エンドユーザーには`bedrock:Retrieve`を直接許可せず、検証済みの Cognito または SAML 属性を使用する API Lambda からのみ Knowledge Base を呼び出す。

## 8. バリデーション規則

取り込み前に、メタデータ生成処理または CI で次を検証する。

| 規則                                        | エラー例                              |
| ------------------------------------------- | ------------------------------------- |
| 必須項目がすべて存在する                    | `document_id`がない                   |
| 未知の項目を原則拒否する                    | `department_name`など未定義キーがある |
| 固定値以外を拒否する                        | `status = ENABLED`                    |
| `document_id`をファイル名から自動推測しない | ファイル名変更で ID が変わる          |
| `effective_from <= effective_to`            | 開始日が終了日より後                  |
| 同一`document_id`の`ACTIVE`は原則 1 版      | 1.1 と 1.2 が同時に`ACTIVE`           |
| `allowed_group_ids`を空にしない             | `[]`                                  |
| 複数の`org:`トークンを禁止する              | `org:ORG_A`と`org:ORG_B`の併記        |
| `allowed_role_ids`を空にしない              | `[]`                                  |
| `ANY_ROLE`と他の職務を併記しない            | `["ANY_ROLE", "MANAGER"]`             |
| 拡張子を小文字、ドットなしにする            | `.PDF`                                |
| PDF 分割 3 項目を all-or-none にする        | `part_number`だけ存在する             |
| `part_number >= 1`                          | `0`                                   |
| `original_page_start >= 1`                  | `0`                                   |
| `original_page_end >= original_page_start`  | 開始 100、終了 51                     |
| メタデータファイルを 1024 バイト以下にする  | 不要な自由記述や大量の ID を格納する  |

## 9. sidecar metadata の形式と例

### 9.1 サイズ制約と混在形式

sidecar ファイルは **1024 バイト以下**でなければならない。Amazon Bedrock のドキュメントには
10 KB と記載されているが、2026-07-21 の実機検証で適用された上限は 1024 バイトだった。実測値を正とする。

超過した場合、その文書は ingestion job で**失敗として計上されないまま無視される**。ジョブは
`COMPLETE` で終わり、`numberOfDocumentsFailed` も 0 のままなので、`failureReasons` を確認しない
限り気づけない。

```text
Ignored 3 files as the associated metadata was larger than
service limit of MaximumFileSizeSupported: 1024 bytes
```

Bedrock は 2 つの記法を受け付ける。

| 記法     | 書き方                                                                 | Embedding 制御           | 1 属性あたりの定型部分 |
| -------- | ---------------------------------------------------------------------- | ------------------------ | ---------------------- |
| 拡張形式 | `"key": { "value": { "type": ..., ... }, "includeForEmbedding": ... }` | できる                   | 約 60 バイト           |
| 簡易形式 | `"key": value`                                                         | できない（`false` 相当） | ほぼなし               |

本定義の 19 属性をすべて拡張形式で書くと、整形なしでも 1,971 バイトとなり上限を超える。
一方、簡易形式では `document_title` を Embedding に含める 3.3 の方針を満たせない。

そこで、**同一ファイル内で両記法を混在させる**。`document_title` だけを拡張形式で書き、
残りを簡易形式で書く。この方式が受理されることは実機で確認済みである。

| 形式                     | サイズ  | 判定 |
| ------------------------ | ------- | ---- |
| 拡張形式・整形あり       | 3,046 B | 超過 |
| 拡張形式・minify         | 1,971 B | 超過 |
| 簡易形式・minify         | 624 B   | 可   |
| 混在形式・minify（採用） | 693 B   | 可   |

ファイルは整形せずに出力し、末尾の改行も付けない。

### 9.2 未分割 PDF の例

対象ファイル：

```text
docs/equipment-incident-manual.pdf
```

メタデータファイル：

```text
docs/equipment-incident-manual.pdf.metadata.json
```

実際の出力は 1 行だが、ここでは読みやすさのために改行して示す。

```json
{
  "metadataAttributes": {
    "metadata_schema_version": 1,
    "document_id": "OPS-MANUAL-001",
    "document_title": {
      "value": { "type": "STRING", "stringValue": "設備障害対応マニュアル" },
      "includeForEmbedding": true
    },
    "document_type": "MANUAL",
    "language": "ja",
    "version": "1.2",
    "status": "ACTIVE",
    "effective_from": 20260701,
    "effective_to": 99991231,
    "owner_organization_id": "ORG_A",
    "owner_department_id": "IT_OPERATIONS",
    "allowed_group_ids": ["org:ORG_A"],
    "allowed_role_ids": ["ANY_ROLE"],
    "original_file_name": "設備障害対応マニュアル.pdf",
    "file_extension": "pdf"
  }
}
```

未分割 PDF なので、`part_number`、`original_page_start`、`original_page_end` は存在しない。

`supersedes_version`、`published_at`、`source_url`、`content_hash` は条件付きであり、
1024 バイトの残量を見ながら設定する。特に `content_hash` は約 86 バイトを消費する。

### 9.3 分割 PDF の追加項目例

分割 PDF の sidecar には、9.2 の文書情報に加えて次を設定する。`document_id`、`version`、
`original_file_name`、`document_title` はすべての分割ファイルで同じ値にする。

```json
"part_number":2,
"original_page_start":51,
"original_page_end":100
```

### 9.4 検索結果に返る値

Retrieve API のレスポンスでは、これらの属性が `metadata` に含まれて返る。実機で
`original_page_start`、`original_page_end`、`part_number`、`document_title`、
`original_file_name` の取得を確認した。

なお `STRING_LIST` は、レスポンス上で値が二重引用符ごと返る場合がある。

```json
"allowed_group_ids": ["\"org:ORG_A\""]
```

アクセス制御フィルターを実装する際は、`in` 条件の一致判定に影響しないかを実機で確認する。

## 10. sidecar metadata に含めない項目

| 項目                                                       | 含めない理由                                                                                                                                  |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `classification`                                           | すべて組織内部向けであり、組織、部署、職務によって制御するため。                                                                              |
| `role_scope`                                               | `allowed_role_ids`の`ANY_ROLE`で表現でき、冗長になるため。                                                                                    |
| `visibility_scope`                                         | `allowed_group_ids`の値から公開範囲を判断でき、二重管理になるため。                                                                           |
| `tenant_id`                                                | 現在の組織モデルでは`allowed_group_ids`とシステムの認証境界で制御するため。複数の独立テナントを同じ KB へ収容すると決定した場合に再検討する。 |
| `mime_type`                                                | 現在は`file_extension`で要件を満たすため。                                                                                                    |
| `ingested_file_extension`                                  | 原本形式のまま取り込むため、`file_extension`と必ず同じになる。                                                                                |
| `chunk_id`、`chunk_index`                                  | Amazon Bedrock が内部管理するため。                                                                                                           |
| `page_number`                                              | Amazon Bedrock の検索結果が返すシステムメタデータを利用するため。                                                                             |
| `section_id`、`section_title`                              | 現在の sidecar は文書単位であり、チャンクごとに異なる値を設定できないため。見出しは parser の検索テキストを利用する。                         |
| `source_uri`                                               | Amazon Bedrock が S3 URI をシステムメタデータとして返すため。                                                                                 |
| `citation_uri`                                             | `source_url`と役割が重複するため。                                                                                                            |
| `metadata_source`、`metadata_model`、`metadata_confidence` | 現時点ではメタデータを AI で自動生成しないため。自動生成する場合に再検討する。                                                                |
| `ingested_at`                                              | Bedrock ingestion job の履歴や運用ログで管理する方が適切なため。                                                                              |
| `parser`、`parser_version`、`embedding_model`              | 文書ごとの情報ではなく、Knowledge Base、Data Source、CDK の構成情報として一元管理するため。                                                   |

## 11. セキュリティ上の注意

メタデータにグループ ID を保存するだけでは認証、認可にならない。

- 未認証ユーザーは検索 API を利用できないようにする。
- Cognito または SAML の検証済み ID token から組織、部署、職務を取得する。
- 組織 ID がない、または不正な場合はフェイルクローズでアクセスを拒否する。
- エンドユーザーが送信した組織、部署、職務 ID をアクセス許可の根拠にしない。
- エンドユーザーへ`bedrock:Retrieve`を直接許可しない。
- VPC 分離だけに依存せず、Knowledge Base と API Lambda の IAM 権限を最小化する。
- 強い組織間分離が必要な場合は、組織別 Knowledge Base または組織別 Vector Index も検討する。

## 12. 参考資料

- [Amazon Bedrock: Connect to Amazon S3 for your knowledge base](https://docs.aws.amazon.com/bedrock/latest/userguide/s3-data-source-connector.html)
- [Amazon Bedrock: RetrievalFilter](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_RetrievalFilter.html)
- [Microsoft Azure AI Search: Document-Level Access Control](https://learn.microsoft.com/en-us/azure/search/search-document-level-access-overview)
- [Google Cloud: Set up data source access control](https://docs.cloud.google.com/generative-ai-app-builder/docs/data-source-access-control)
- [Pinecone: Data modeling](https://docs.pinecone.io/guides/index-data/data-modeling)
- [Pinecone: Implement multitenancy](https://docs.pinecone.io/guides/index-data/implement-multitenancy)
