# Langfuse 統合ガイド

GenU RAG PoC に Langfuse（AWS 上でのセルフホスト）を組み込むための手順です。

## 概要

このリポジトリでは、次の方法で Langfuse を統合できます。

### 推奨: AWS CDK を使った自動化

- 最も簡単で再現性が高い
- `cdk.json` に設定を追加するだけで、デプロイ時に自動的に GenU 側へ統合される
- 環境の再構築がしやすい

### オプション: AWS Generative AI Solution Box で先にデプロイする

- Langfuse インフラだけを先にセットアップする
- その後、CDK の設定で GenU と統合する

---

## フェーズ1: Langfuse を AWS にデプロイする

### 方法A: AWS Solution Box（初期構築として推奨）

1. [Solution Box の Langfuse ページ](https://aws-samples.github.io/sample-one-click-generative-ai-solutions/solutions/langfuse/) を開く
2. リージョンに東京を選択し、`Deploy` をクリックして CloudFormation で作成する
3. 完了後、Stack Outputs から次の値を取得する
   - `LangfuseUrl`
     - 例: `https://xxxx.cloudfront.net`
   - 管理画面へのアクセス情報
4. Langfuse UI にログインし、Project の `Public Key` / `Secret Key` を発行する

### 方法B: GenU CDK デプロイで同時構築する（将来対応予定）

現時点では、まず方法Aの Solution Box で Langfuse をセットアップしてください。

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
| `packages/cdk/package.json`                         | `langfuse` パッケージ依存を追加                  | 完了 |

### 手順

#### 2-1. cdk.json に設定を追加する

```json
{
  "context": {
    "langfuseEnabled": true,
    "langfuseHost": "https://<LangfuseUrl>",
    "langfusePublicKey": "<PUBLIC_KEY>",
    "langfuseSecretKey": "<SECRET_KEY>"
  }
}
```

**重要:** `langfuseSecretKey` は `cdk.json` に平文で書かず、SSM Parameter Store や環境変数経由で注入する方が安全です。

#### 2-2. 依存パッケージをインストールする

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
- Express ミドルウェア経由でトレースを自動開始する
- API handler からのレスポンスを自動的にキャプチャする

---

## フェーズ3: 動作確認

1. GenU Chat UI を開く
2. RAG チャットで複数のリクエストを送信する
3. フェーズ1で取得した URL から Langfuse UI にアクセスする
4. `Traces` タブでリクエストが記録されているか確認する
5. 各トレースで次の情報が見えることを確認する
   - API メソッドとパス
   - HTTP ステータスコード
   - レスポンス遅延
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

### 環境変数で指定する場合（CI/CD 推奨）

```bash
export CDK_CONTEXT='{"langfuseEnabled":true,"langfuseHost":"https://...","langfusePublicKey":"pk_...","langfuseSecretKey":"sk_..."}'
npm run cdk:deploy
```

### 無効化

```json
{
  "context": {
    "langfuseEnabled": false
  }
}
```

Langfuse を無効にした場合、Lambda で SDK はロードされません。そのため、パフォーマンスへの影響はありません。

---

## 自動トレースの詳細

### キャプチャされる情報

各 API リクエストについて、次の情報が自動的にトレースされます。

| 項目                 | 説明                                   |
| -------------------- | -------------------------------------- |
| **Trace**            | リクエスト全体（PATH + HTTP メソッド） |
| **Span**             | handler 実行（個別 endpoint の処理）   |
| **ステータスコード** | HTTP レスポンスコード                  |
| **遅延**             | リクエスト処理時間                     |
| **エラー情報**       | 発生時のエラースタックトレース         |

### カスタマイズ（将来対応）

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
  span.error(err);
  throw err;
}
```

---

## トラブルシューティング

### Langfuse に接続できない

- `langfuseHost` が正しく設定されているか確認する
- Lambda から Langfuse host へのネットワークアクセスを確認する
  - セキュリティグループ
  - ルート
- CloudWatch Logs でエラーメッセージを確認する

### トレースが記録されない

- `langfuseEnabled: true` に設定されているか確認する
- Lambda 環境変数が正しく設定されているか確認する

```bash
aws lambda get-function-configuration --function-name <ApiHandler> --query Environment
```

- CloudWatch Logs でミドルウェア初期化エラーがないか確認する

### Lambda cold start の遅延

- 初回リクエスト時に Langfuse SDK 初期化で 100ms 程度の遅延が発生することがある
- CloudWatch Metrics で `Duration` を監視する

---

## セキュリティのベストプラクティス

1. **Secret Key の管理**
   - `cdk.json` に直接書かない
   - AWS Secrets Manager または SSM Parameter Store を使う
   - 本番環境では CI/CD パイプラインから注入する

2. **ネットワークセキュリティ**
   - Langfuse host が HTTPS のみを受け付けるように設定する
   - VPC 環境では VPC endpoint 設定を検討する

3. **アクセス制御**
   - Langfuse UI へのアクセスは IP 制限または認証で保護する
   - Public Key / Secret Key のローテーション周期を決める

---

## FAQ

**Q: Solution Box で Langfuse をセットアップする必要はありますか？**  
A: いいえ。CDK で `langfuseEnabled: true` と認証情報を設定すれば、外部の Langfuse インスタンスを使用できます。

**Q: 既存の GenU スタックに Langfuse を追加できますか？**  
A: はい。`cdk.json` に設定を追加し、再デプロイするだけです。

**Q: Langfuse を後から無効化できますか？**  
A: はい。`langfuseEnabled: false` に変更し、再デプロイします。

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
