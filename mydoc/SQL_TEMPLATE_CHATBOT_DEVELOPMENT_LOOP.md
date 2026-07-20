# SQL作成アシスタント 開発ループ

## 1. 目的

SQL作成アシスタントの開発で、時間のかかるCloudFormationデプロイを最小限にする。
初回に必要なインフラを通常デプロイし、その後はローカルWeb、Lambda hotswap、S3への直接同期で
反復開発する。開発完了時に通常デプロイを行い、CloudFormationと実リソースを一致させる。

```text
初回フルデプロイ
  ↓
ローカルWeb + デプロイ済みAPI
  ↓
Lambdaコードはhotswap
YAML/JSONはS3 sync
ReactはVite Hot Reload
  ↓
テスト・CDK diff
  ↓
最終フルデプロイ
```

この手順は `dev` 環境専用とし、staging/prodではhotswapを使用しない。

## 2. 役割ごとの反映方法

| 変更対象                 | 日常の反映方法                   | 通常deploy   |
| ------------------------ | -------------------------------- | ------------ |
| React/TypeScript UI      | Vite Hot Reload                  | 開発完了時   |
| API Lambdaロジック       | dev stackへhotswap               | 開発完了時   |
| YAML/Mock JSON           | 指定S3 prefixへsync              | 不要         |
| IAM                      | 対象外                           | 変更時に必須 |
| Lambda環境変数           | 対象外                           | 変更時に必須 |
| StackInput/CDK resource  | 対象外                           | 変更時に必須 |
| Web build環境変数/Output | 対象外                           | 変更時に必須 |
| Cognito/API Gateway      | 対象外                           | 変更時に必須 |
| npm依存関係              | ローカルinstall後にbuild/hotswap | 開発完了時   |

## 3. 事前準備

### 3.1 対象環境

この文書の例では次を使用する。

```text
CDK env: dev
Stack: GenerativeAiUseCasesStackdev
AWS profile: rag-poc-admin
Region: ap-northeast-1
```

実際の環境名、profile、region、Bucket名、prefixに読み替える。

### 3.2 S3へ初期データを配置する

管理者権限でcatalog、template、mockを指定prefixへ配置する。

```bash
aws s3 sync ./local/sql-template-assets \
  s3://<bucket>/<prefix>/ \
  --region ap-northeast-1 \
  --profile rag-poc-admin
```

開発中は意図しない削除を避けるため `--delete` を付けない。

配置後に確認する。

```bash
aws s3 ls \
  s3://<bucket>/<prefix>/ \
  --recursive \
  --region ap-northeast-1 \
  --profile rag-poc-admin
```

### 3.3 初回フルデプロイに含めるもの

初回デプロイ時点で、以後のLambdaコード変更をhotswapだけで反映できる状態にする。

- `sqlTemplateAssistantEnabled`
- Bucket名、region、prefixのStackInput
- API Lambdaの環境変数
- dev環境のAPI Lambda CORS許可元に `http://localhost:5173`
- prefix限定の `s3:GetObject`
- Webのfeature flag
- CloudFormation Output
- `setup-env.sh` の環境変数取得
- `/sql-template-assistant` のRouteとメニュー
- `/sql-templates` Express Routerのskeleton
- YAML parserなどLambda bundleに必要な依存関係
- `env=dev` と対象stackを固定した `cdk:deploy:dev:hotswap` script

diffを確認する。

```bash
npm run cdk:diff -- -c env=dev
```

通常デプロイする。

```bash
npm run cdk:deploy -- -c env=dev
```

デプロイ後、CloudFormation Outputに次があることを確認する。

```text
SqlTemplateAssistantEnabled=true
```

加えて、API Lambdaの `ALLOWED_ORIGINS` に次の2つが含まれることを確認する。

```text
<デプロイ済みdev Web URL>
http://localhost:5173
```

localhostはdevだけに許可し、staging/prodには追加しない。`ALLOWED_ORIGINS` はLambda環境変数なので、
この変更はhotswapではなく初回フルデプロイで反映する。

## 4. 日常の開発ループ

### Step 1: ローカルWebを起動する

`setup-env.sh` がdev stackのCloudFormation Outputを読み、ローカルViteを起動する。

```bash
export AWS_PROFILE=rag-poc-admin
export AWS_DEFAULT_REGION=ap-northeast-1
npm run web:devw --env=dev
```

ブラウザで次を開く。

```text
http://localhost:5173/sql-template-assistant
```

構成は次のとおり。

```text
localhost:5173のReact
  ↓ Cognito認証
dev環境のAPI Gateway
  ↓
dev環境のAPI Lambda
  ↓
指定S3 Bucket / prefix
```

React変更はVite Hot Reloadで反映されるため、Webの変更だけならdeployもhotswapも不要である。
この接続には、初回フルデプロイでAPI Lambdaの `ALLOWED_ORIGINS` に
`http://localhost:5173` が追加済みであることが前提となる。

### Step 2: 純粋ロジックをテストする

Lambdaへ反映する前に、YAML schema、入力検証、日付変換、SQL Rendererをunit testする。

```bash
npm -w packages/cdk run test -- sqlTemplate
```

Webのreducer、hook、componentをテストする。

```bash
npm -w packages/web run test -- sqlTemplate
```

対象テスト名は実装後の配置に合わせて調整する。

### Step 3: hotswap前にCDK diffを確認する

```bash
npm run cdk:diff -- -c env=dev
```

次のような変更だけであることを確認する。

- API Lambda code asset
- LambdaにbundleされるTypeScriptロジック
- Lambdaにbundleされる依存パッケージ

次が含まれている場合はhotswapせず、通常deployへ切り替える。

- IAM Policy
- Lambda environment
- S3 Bucket/Policy
- API Gateway resource/method/authorizer
- Cognito
- CloudFormation Output
- VPC、Security Group
- 新しいAWS resource

### Step 4: API Lambdaをhotswapする

既存コマンドは `--all` と `--force` を含むため、dev環境だけで使用する。

```bash
npm run cdk:deploy:quick:hotswap -- -c env=dev
```

SQL作成アシスタント実装時に、対象stackとCDK contextを固定する専用scriptを追加する。

```json
{
  "scripts": {
    "cdk:deploy:dev:hotswap": "npm -w packages/cdk run cdk -- deploy GenerativeAiUseCasesStackdev --exclusively -c env=dev --hotswap --method=direct --require-approval never"
  }
}
```

`-c env=dev` は `parameter.ts` のdev設定を選択するために必須である。現在の `cdk.json` の
`env` は空文字なので省略しない。`--exclusively` により、AgentCoreなどの依存stackを
hotswap対象へ含めない。

追加後は次を利用する。

```bash
npm run cdk:deploy:dev:hotswap
```

Express APIは既存API Gatewayのcatch-all proxy配下で動作するため、`/sql-templates` 内の
Route追加・変更は通常、Lambdaコードのhotswapだけで反映できる。

### Step 5: ブラウザから確認する

Viteは起動したままでよい。hotswap完了後、画面から次を確認する。

1. catalogを取得できる
2. templateを選択できる
3. YAMLに応じたフォームが表示される
4. validation errorが表示される
5. 修正後にSQLが生成される
6. モック結果が表示される

Lambdaエラーはdev環境のCloudWatch Logsでも確認する。

### Step 6: YAML/JSONを変更する

ローカルfixtureを変更し、unit testを通してからS3へ同期する。

```bash
aws s3 sync ./local/sql-template-assets \
  s3://<bucket>/<prefix>/ \
  --region ap-northeast-1 \
  --profile rag-poc-admin
```

YAML/JSONだけの変更ではCDK deployもLambda hotswapも不要である。
catalogとtemplateを変更する場合は両方のversionを同時に更新する。

## 5. 通常deployへ切り替える条件

次のどれかを変更した場合、その時点で通常deployする。

| 変更                          | 理由                               |
| ----------------------------- | ---------------------------------- |
| Bucket名、region、prefix      | Lambda環境変数/IAMが変わる         |
| prefix限定IAM                 | CloudFormation管理のPolicyが変わる |
| feature flag                  | Web build環境とOutputが変わる      |
| `setup-env.sh` が読むOutput   | CloudFormation Output追加が必要    |
| localhost CORS許可元          | Lambda環境変数が変わる             |
| API Gateway/Cognito           | hotswap対象外                      |
| Lambda memory、timeout、VPC   | Function configurationが変わる     |
| 別アカウントBucket Policy/KMS | 外部resource policyが変わる        |
| 新しいAWS resource            | CloudFormation更新が必要           |

通常deploy後は、再びLambdaロジックだけをhotswapするループへ戻れる。

## 6. 開発完了時の手順

### 6.1 品質チェック

```bash
npm run web:build
npm run web:test
npm run cdk:build
npm run cdk:test
npm run web:lint
npm run cdk:lint
```

既存の全体lintは自動修正を含むため、作業ツリーを確認してから実行する。

### 6.2 最終diff

```bash
npm run cdk:diff -- -c env=dev
```

意図したIAM、環境変数、Output、Lambda/Web assetだけが含まれることを確認する。

### 6.3 最終フルデプロイ

```bash
npm run cdk:deploy -- -c env=dev
```

hotswapはCloudFormationを経由せず実リソースを変更するため、開発中のdev stackにはdriftが生じる。
最終フルデプロイを省略せず、CloudFormation templateと実リソースを一致させる。

### 6.4 デプロイ後確認

デプロイ済みWebから次を再確認する。

1. SQL作成アシスタントのメニューが表示される
2. Cognito認証済みユーザーだけがAPIを利用できる
3. S3の指定prefixだけを参照できる
4. 入力検証、SQL生成、モック実行が動作する
5. Use Case Builder、Agent Builder、通常チャットに回帰がない

## 7. hotswap運用ルール

- dev環境だけで使用する
- staging/prodでは使用しない
- 専用scriptから `-c env=dev` と `--exclusively` を削除しない
- hotswap前にunit testとCDK diffを行う
- インフラ変更をLambdaコード変更へ混在させない
- 開発完了時に必ず通常deployする
- 複数人で同じdev stackを使う場合、hotswap実行者とcommitを共有する
- hotswap中のコードを正式リリース済みと扱わない
- 問題が起きた場合、正常なcommitのLambdaコードをhotswapするか通常deployで復旧する

## 8. 推奨する1サイクル

```text
コード/YAML変更
  ↓
対象unit test
  ↓
ReactだけならHot Reload
  ├─ 完了
  └─ Lambda変更あり
       ↓
     cdk diff
       ├─ インフラ変更あり → 通常deploy
       └─ Lambda codeだけ → hotswap
                              ↓
                            画面確認
                              ↓
                            次の変更
```

このループにより、時間のかかるフルデプロイを初回、インフラ変更時、開発完了時に限定する。
