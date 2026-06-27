# 運用メモ

このリポジトリの日常運用メモです。主に、コストを抑えるためのデプロイ/削除サイクルと、Langfuse などの任意機能の切り替え方をまとめています。

## デプロイ/削除サイクル（コスト最小化）

このリポジトリは、アイドル時の課金を避けるため、必要なときに作って使い終わったら削除する運用を想定しています。

```bash
npm run cdk:deploy -- --profile rag-poc-admin
# ... 使う ...
npm run cdk:destroy -- --profile rag-poc-admin
```

`cdk:destroy` は GenU/RAG 関連スタックをまとめて削除します。残るのは CDK bootstrap スタック（`CDKToolkit`）と、ほぼ空の assets 用 S3 バケット/ECR リポジトリだけです。これらは実質的に無料に近く、同じ AWS アカウント内の CDK プロジェクトで共有されるため、毎回削除する必要はありません。

## Langfuse（LLM オブザーバビリティ）

Langfuse 本体（AWS 上でセルフホストする ECS Fargate + Aurora + Redis + ALB）は、このリポジトリの CDK アプリには含まれていません。つまり `cdk:deploy` / `cdk:destroy` では作成/削除されません。Langfuse には GenU とは別のライフサイクルがあります。

構成は2つに分かれます。

1. **Langfuse サーバー本体**
   - `scripts/langfuse-deploy.sh` / `scripts/langfuse-destroy.sh` で作成/削除する
   - AWS Generative AI Solution Box の CloudFormation スタックをラップしている
   - 手動でコンソールをクリックする必要はない
2. **GenU 側の切り替え**
   - `cdk.json` の `langfuseEnabled` で制御する
   - GenU の Lambda API が Langfuse サーバーに trace を送るかどうかを決める
   - Langfuse サーバーが存在している場合にだけ意味がある

### 前提条件

- AWS CLI がインストールされていること
- 使用する profile でログイン済みであること
  - `aws sso login --profile rag-poc-admin`
- スクリプトはリポジトリルートから実行すること
  - 相対パスを使っているため
- どちらのスクリプトも CodeBuild が完了するまでフォアグラウンドで待機する
  - deploy は約 25〜35 分
  - destroy は約 10〜20 分
  - 待ちたくない場合は `&` を付けるか、別ターミナルで実行する

### コストとセキュリティの注意

- Langfuse の常時稼働コストは、おおよそ **月 $160〜180** 程度です
  - Aurora、ElastiCache、ECS Fargate、ALB が主なコスト要因です
  - 使わないときは `langfuse:destroy` で削除する想定です
- Solution Box のテンプレートは、デプロイ/削除中の CodeBuild ロールに `AdministratorAccess` を付与します
  - これは上流側の挙動であり、このリポジトリのスクリプトが追加しているものではありません
  - 重要な AWS アカウントで実行する前に把握しておくべき点です
- Langfuse の ALB はデフォルトで公開アクセス可能です
  - `0.0.0.0/0`
  - 短期間の PoC では許容しやすいですが、長期間運用する場合は IP allowlist や前段認証などで保護してください

### 1. Langfuse サーバーをデプロイする

```bash
npm run langfuse:deploy -- --profile rag-poc-admin --email you@example.com
```

このコマンドは `LangfuseDeploymentStack` CloudFormation スタックを作成し、その内部で実行される CodeBuild プロジェクトをポーリングします。CodeBuild は ECS Fargate、Aurora、Redis、ALB などの Langfuse 基盤を作成します。完了まで約 25〜35 分かかります。手動のコンソール操作は不要です。

**このスクリプトは Langfuse URL や API key を標準出力には表示しません。** それらは `--email` で指定した宛先への SNS メール通知にのみ含まれます。デプロイごとに新しいキーが生成されるため、古いキーは引き継がれません。

メールが届いたら、次の3つの値を `packages/cdk/cdk.json` にコピーします。

```json
"langfuseEnabled": true,
"langfuseHost": "https://<url-from-email>",
"langfusePublicKey": "pk-lf-<from-email>",
"langfuseSecretKey": "sk-lf-<from-email>"
```

その後、GenU Lambda が trace を送信し始めるように再デプロイします。

```bash
npm run cdk:deploy -- --profile rag-poc-admin
```

### 2. Langfuse サーバーを削除する

```bash
npm run langfuse:destroy -- --profile rag-poc-admin --email you@example.com
```

このコマンドは `LangfuseDeletionStack` を作成し、実際の Langfuse インフラに対して `cdk destroy --force --all` を実行します。完了を待ったあと、ラッパースタックである `LangfuseDeletionStack` と元の `LangfuseDeploymentStack` の両方を削除します。

Langfuse のデータ（traces、prompts、configs）はすべて削除されます。元に戻す方法はありません。

削除後は `cdk.json` の `"langfuseEnabled": false` に戻し、GenU を再デプロイしてください。サーバー削除後は、以前の key は使えなくなります。

### GenU 側の切り替えに関係するファイル

| ファイル                                            | 役割                                                                                   |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `packages/cdk/cdk.json`                             | `langfuseEnabled`、`langfuseHost`、`langfusePublicKey`、`langfuseSecretKey` を設定する |
| `packages/cdk/lib/stack-input.ts`                   | Zod スキーマと検証。`langfuseEnabled: true` の場合、3つの値を必須にする                |
| `packages/cdk/lib/generative-ai-use-cases-stack.ts` | `params.langfuse*` を `Api` construct に渡す                                           |
| `packages/cdk/lib/construct/api.ts`                 | 有効時のみ API Lambda に `LANGFUSE_*` 環境変数を渡す                                   |
| `packages/cdk/lambda/api/langfuse.ts`               | Langfuse SDK クライアント。無効時は `null` になり、呼び出し側は何もしない              |
| `packages/cdk/lambda/api/index.ts`                  | 有効時にリクエストごとのトレースを作成する                                             |
| `packages/cdk/lambda/api/routes/helpers.ts`         | `wrapHandler()` でリクエストごとの span（遅延、成功/失敗）を追加する                   |

### コスト制御の推奨パターン

| 状況                   | Langfuse サーバー                                   | `langfuseEnabled`                  |
| ---------------------- | --------------------------------------------------- | ---------------------------------- |
| 通常時/アイドル時      | 削除済み（`langfuse:destroy`）                      | `false`                            |
| トレースを使って調査中 | 稼働中（`langfuse:deploy` 後、メールの key を設定） | `true`                             |
| 調査完了後             | `langfuse:destroy`                                  | `false` に戻して GenU を再デプロイ |
