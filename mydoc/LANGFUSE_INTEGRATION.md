# Langfuse 統合ガイド

GenU RAG PoC に Langfuse（AWS 上でのセルフホスト）を組み込むための手順です。

## 概要

このリポジトリでは、Langfuse は GenU 本体とは別ライフサイクルで扱います。

1. **Langfuse サーバー本体**
   - `npm run langfuse:deploy` / `npm run langfuse:destroy` で作成/削除する
   - 内部では AWS Generative AI Solution Box の CloudFormation テンプレートを使う
   - ブラウザで Solution Box 画面を手動クリックする必要はない
2. **GenU 側の送信設定**
   - `packages/cdk/cdk.json` の `langfuseEnabled` と API key で制御する
   - GenU の API Lambda が Langfuse サーバーに trace を送るかどうかを決める

`cdk:deploy` / `cdk:destroy` は GenU 本体の操作です。Langfuse サーバー本体は作成/削除しません。

---

## フェーズ1: Langfuse を AWS にデプロイする

### 推奨: リポジトリのスクリプトでデプロイする

```bash
aws sso login --profile rag-poc-admin
npm run langfuse:deploy -- --profile rag-poc-admin --email you@example.com
```

`you@example.com` は、Langfuse の URL、ログイン情報、Public/Secret API key を受け取るメールアドレスに置き換えます。このメールアドレスは `cdk.json` には書きません。

このコマンドは `LangfuseDeploymentStack` CloudFormation スタックを作成し、その内部で実行される CodeBuild プロジェクトを待ちます。CodeBuild は ECS Fargate、Aurora、Redis、ALB などの Langfuse 基盤を作成します。完了まで約 25〜35 分かかります。

**重要:** Langfuse URL や API key は標準出力には表示されません。`--email` に指定した宛先への SNS メール通知で確認します。デプロイごとに新しい key が生成されるため、古い key は引き継がれません。

### 手動で Solution Box を使う場合

スクリプトを使わず、[AWS Generative AI Solution Box の Langfuse ページ](https://aws-samples.github.io/sample-one-click-generative-ai-solutions/solutions/langfuse/) から手動で作成することもできます。ただし、このリポジトリではスクリプト経由の作成を推奨します。

---

## フェーズ2: GenU Lambda に Langfuse SDK を組み込む（CDK方式）

### 実装済みの変更一覧

| ファイル                                            | 変更内容                                         | 状態 |
| --------------------------------------------------- | ------------------------------------------------ | ---- |
| `packages/cdk/cdk.json`                             | Langfuse 設定キーを追加                          | 完了 |
| `packages/cdk/lib/stack-input.ts`                   | Zod スキーマに Langfuse フィールドを追加         | 完了 |
| `packages/cdk/lib/construct/api.ts`                 | Lambda 環境変数に Langfuse 設定を渡す            | 完了 |
| `packages/cdk/lib/generative-ai-use-cases-stack.ts` | `Api` construct に Langfuse 設定を渡す           | 完了 |
| `packages/cdk/lambda/api/index.ts`                  | Langfuse SDK 初期化と Express ミドルウェアを追加 | 完了 |
| `packages/cdk/lambda/api/routes/helpers.ts`         | `wrapHandler()` にトレース span を追加           | 完了 |
| `packages/cdk/lambda/utils/bedrockApi.ts`           | Bedrock chat の generation / token usage を追加  | 完了 |
| `packages/cdk/lambda/retrieve*.ts`                  | RAG 検索結果の span を追加                       | 完了 |
| `packages/cdk/lambda/utils/langfuse.ts`             | Langfuse 共通 helper を追加                      | 完了 |
| `packages/web/src/hooks/useRag*.ts`                 | RAG 検索に chat id を渡し session で関連付け     | 完了 |
| `packages/cdk/package.json`                         | `langfuse` パッケージ依存を追加                  | 完了 |

### 手順

#### 2-1. メールで届いた値を cdk.json に設定する

```json
{
  "context": {
    "langfuseEnabled": true,
    "langfuseHost": "https://<url-from-email>",
    "langfusePublicKey": "pk-lf-<from-email>",
    "langfuseSecretKey": "sk-lf-<from-email>"
  }
}
```

**重要:** `langfuseSecretKey` は secret です。PoC では `cdk.json` に直接書けますが、長期運用では Secrets Manager、SSM Parameter Store、CI/CD の secret 変数などで管理してください。

#### 2-2. 依存パッケージを確認する

```bash
cd packages/cdk
npm install
```

`langfuse` パッケージはすでに `package.json` に含まれています。

#### 2-3. 再デプロイする

```bash
npm run cdk:deploy -- --profile <profile-name>
```

デプロイ時に、次の処理が自動的に実行されます。

- `cdk.json` の Langfuse 設定を検証する
- `langfuseEnabled: true` の場合のみ、Lambda 環境変数を設定する
- Express ミドルウェア経由で API リクエストごとの trace を作成する
- `wrapHandler()` を通る handler の span を作成する
- Bedrock chat completion を generation として記録する
- RAG 検索結果を span として記録する
- status code、エラー情報、token usage を記録する

---

## フェーズ3: 動作確認

1. GenU Chat UI を開く
2. RAG チャットで複数のリクエストを送信する
3. フェーズ1で取得した URL から Langfuse UI にアクセスする
4. `Traces` タブでリクエストが記録されているか確認する
5. 各トレース / generation で次の情報が見えることを確認する
   - API メソッドとパス
   - HTTP ステータスコード
   - レスポンス遅延
   - model id
   - input / output token
   - prompt / completion（長文は切り詰め）
   - RAG 検索 query と検索結果
   - エラー情報（発生時）

---

## 設定方法の詳細

### cdk.json での設定例

```json
{
  "context": {
    "langfuseEnabled": true,
    "langfuseHost": "https://langfuse.example.com",
    "langfusePublicKey": "pk_xxx...",
    "langfuseSecretKey": "sk_xxx..."
  }
}
```

### CDK context で指定する場合

```bash
npm run cdk:deploy -- \
  --profile rag-poc-admin \
  -c langfuseEnabled=true \
  -c langfuseHost=https://... \
  -c langfusePublicKey=pk-lf-... \
  -c langfuseSecretKey=sk-lf-...
```

### 無効化

```json
{
  "context": {
    "langfuseEnabled": false
  }
}
```

Langfuse を無効にした場合、Lambda で Langfuse client は作成されず、呼び出し側は no-op になります。

---

## 自動トレースの詳細

### キャプチャされる情報

Chat / RAG について、次の情報が自動的にトレースされます。

| 項目                    | 説明                                                                  |
| ----------------------- | --------------------------------------------------------------------- |
| **Trace**               | API リクエスト、または chat completion 単位のまとまり                 |
| **Span**                | `wrapHandler()` を通る handler 実行、Kendra / Knowledge Base 検索処理 |
| **Generation**          | Bedrock Converse / ConverseStream 呼び出し                            |
| **Model**               | Bedrock model id                                                      |
| **Prompt / Completion** | 入力 messages と出力 text（長文や添付データは切り詰め）               |
| **Token usage**         | input / output / total / cache token                                  |
| **RAG 検索情報**        | query、result count、上位検索結果の title / URI / excerpt             |
| **エラー情報**          | handler 例外時、または Bedrock stream error 時の error code/message   |

添付ファイルや画像の base64 本体は Langfuse には送らず、type、name、media type、data length だけを記録します。

### カスタマイズ

より詳細な計測が必要な場合は、個別 handler で次のようにカスタマイズできます。

```typescript
const span = langfuseTrace.span({
  name: 'bedrock-api-call',
  input: { modelId: 'claude-3', messageCount: 5 },
});

try {
  const result = await bedrockClient.invoke(...);
  span.end({ output: { tokenCount: 200 } });
} catch (err) {
  span.end({
    level: 'ERROR',
    statusMessage: err instanceof Error ? err.message : String(err),
  });
  throw err;
}
```

---

## トラブルシューティング

### Langfuse に接続できない

- Langfuse サーバー本体が存在するか確認する
  - 削除済みの場合、管理画面も trace 送信先も存在しない
- `langfuseHost` が正しく設定されているか確認する
- Lambda から Langfuse host へのネットワークアクセスを確認する
  - セキュリティグループ
  - ルート
- CloudWatch Logs でエラーメッセージを確認する

### トレースが記録されない

- `langfuseEnabled: true` に設定されているか確認する
- `langfuseHost` / `langfusePublicKey` / `langfuseSecretKey` がメールで届いた最新値か確認する
- Lambda 環境変数が正しく設定されているか確認する

```bash
aws lambda get-function-configuration --function-name <ApiHandler> --query Environment
```

- CloudWatch Logs でミドルウェア初期化エラーがないか確認する

### Lambda cold start の遅延

- 初回リクエスト時に Langfuse SDK 初期化で 100ms 程度の遅延が発生することがある
- CloudWatch Metrics で `Duration` を監視する

### メールが届かない

- `--email` に指定したメールアドレスが正しいか確認する
- SNS subscription confirmation が届いている場合は承認する
- 迷惑メールや quarantine を確認する
- CodeBuild が失敗していないか確認する

---

## セキュリティのベストプラクティス

1. **Secret Key の管理**
   - `cdk.json` に直接書かない
   - AWS Secrets Manager または SSM Parameter Store を使う
   - 本番環境では CI/CD パイプラインから注入する

2. **ネットワークセキュリティ**
   - Langfuse host が HTTPS のみを受け付けるように設定する
   - Solution Box の既定では ALB が公開アクセス可能になる点を理解する
   - 長期運用では IP allowlist や前段認証を検討する

3. **アクセス制御**
   - Langfuse UI へのアクセスは IP 制限または認証で保護する
   - Public Key / Secret Key のローテーション周期を決める

---

## FAQ

**Q: Solution Box で Langfuse をセットアップする必要はありますか？**  
A: この repo の `langfuse:deploy` は内部で Solution Box の CloudFormation テンプレートを使います。手動で Solution Box 画面をクリックする必要はありません。外部の既存 Langfuse を使う場合は、`cdk.json` にその host と API key を設定すれば利用できます。

**Q: 既存の GenU スタックに Langfuse を追加できますか？**  
A: はい。`cdk.json` に設定を追加し、再デプロイするだけです。

**Q: Langfuse を後から無効化できますか？**  
A: はい。`langfuseEnabled: false` に変更し、再デプロイします。

**Q: Langfuse サーバーも CDK destroy で削除されますか？**  
A: いいえ。GenU の `cdk:destroy` では削除されません。Langfuse サーバーを削除する場合は `npm run langfuse:destroy -- --profile rag-poc-admin --email you@example.com` を実行します。

**Q: `--email` はどこに書きますか？**  
A: ファイルには書きません。`npm run langfuse:deploy -- --profile rag-poc-admin --email you@example.com` のように、コマンド実行時に指定します。

**Q: レイテンシへの影響はどのくらいですか？**  
A: 無効時は影響ありません。有効時は Lambda cold start 時にわずかな遅延（通常 100ms 以下）が発生します。

**Q: 複数の AWS アカウントで共有 Langfuse を使用できますか？**  
A: はい。各アカウントで同じ `langfuseHost` と認証情報を設定すれば可能です。

---

## 参考リンク

- [Langfuse Documentation](https://docs.langfuse.com)
- [Langfuse Self-hosting Guide](https://docs.langfuse.com/guides/self-hosting)
- [AWS Generative AI Solution Box](https://aws-samples.github.io/sample-one-click-generative-ai-solutions/)
- [このリポジトリの CDK ドキュメント](../docs/en/DEVELOPMENT.md)
