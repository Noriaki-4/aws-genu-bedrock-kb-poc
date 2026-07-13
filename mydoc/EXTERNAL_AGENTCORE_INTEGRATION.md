# genU から外部 AgentCore Runtime を呼び出す方法

## 目的

別リポジトリで作成・デプロイ済みの Amazon Bedrock AgentCore Runtime を、genU の AgentCore 画面から呼び出す。

この環境では次の構成を対象とする。

```text
genU: aws-genu-bedrock-kb-poc
  └─ Cognito の認証済みユーザーロール
       └─ bedrock-agentcore:InvokeAgentRuntime
            └─ aws-agentcore-sample の AgentCore Runtime
                 BedrockAgent_BedrockAgent
```

genU は外部 Runtime を新しく作成しない。既存 Runtime の ARN をフロントエンドへ渡し、サインインユーザーが Cognito の一時クレデンシャルを使って Runtime を直接呼び出す。

## 前提条件

- 外部 AgentCore Runtime がデプロイ済みであること
- genU と外部 Runtime が同じ AWS アカウントにあること
  - この手順ではアカウント `035351467732` を使用する
  - 別アカウントの場合は、呼び出し先側のリソースポリシーを含む追加のクロスアカウント設計が必要
- Runtime と `agentCoreRegion` を同じリージョンにそろえること
  - この手順では `ap-northeast-1`
- genU と Runtime のリクエスト・レスポンス形式に互換性があること

## 1. 外部 Runtime の名前と ARN を確認する

AgentCore Runtime を作成した AWS プロファイルで確認する。

```bash
aws bedrock-agentcore-control list-agent-runtimes \
  --region ap-northeast-1 \
  --profile rag-poc-admin \
  --query "agentRuntimes[].{Name:agentRuntimeName,Arn:agentRuntimeArn,Status:status}" \
  --output table
```

今回使用する値は次のとおり。

| 項目       | 値                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------- |
| Runtime名  | `BedrockAgent_BedrockAgent`                                                                          |
| リージョン | `ap-northeast-1`                                                                                     |
| ARN        | `arn:aws:bedrock-agentcore:ap-northeast-1:035351467732:runtime/BedrockAgent_BedrockAgent-052O95DjiR` |

`name` は genU 内で使う識別名で、ARN が実際の呼び出し先を決める。この環境では混乱を避けるため、AgentCore に登録された Runtime 名と同じ値を指定する。日本語などの画面表示用名称は `display_name` に指定する。

## 2. genU の parameter.ts に登録する

`packages/cdk/parameter.ts` の `dev` 環境へ次のように設定する。

```typescript
const envs: Record<string, Partial<StackInput>> = {
  dev: {
    agentCoreRegion: 'ap-northeast-1',

    agentCoreExternalRuntimes: [
      {
        name: 'BedrockAgent_BedrockAgent',
        // eslint-disable-next-line i18nhelper/no-jp-string
        display_name: '別戸六区 英慈円斗',
        // eslint-disable-next-line i18nhelper/no-jp-string
        description: '自分の名前を回答するサンプルエージェントです。',
        arn: 'arn:aws:bedrock-agentcore:ap-northeast-1:035351467732:runtime/BedrockAgent_BedrockAgent-052O95DjiR',
      },
    ],

    agentBuilderEnabled: false,
    createGenericAgentCoreRuntime: false,
  },
};
```

### 各設定の意味

| 設定                            | 意味                                                                                      |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| `agentCoreRegion`               | AgentCore 関連リソースの基準リージョン。外部呼び出し時のリージョンは ARN からも取得される |
| `agentCoreExternalRuntimes`     | genU に表示して呼び出しを許可する、作成済み Runtime の一覧                                |
| `name`                          | AgentCore Runtime の識別名。英数字とアンダースコアのみ                                    |
| `display_name`                  | genU の一覧やチャット画面に表示する任意の名称                                             |
| `description`                   | genU の一覧やチャット画面に表示する説明                                                   |
| `arn`                           | 呼び出す AgentCore Runtime の ARN                                                         |
| `agentBuilderEnabled: false`    | genU の Agent Builder と、その専用 Runtime を作成しない                                   |
| `createGenericAgentCoreRuntime` | genU 付属の汎用 AgentCore Runtimeを作成しない。今回は外部 Runtime を利用するため `false`  |

`agentCoreExternalRuntimes` が1件以上あれば、`createGenericAgentCoreRuntime` が `false` でも genU の AgentCore ユースケースは有効になる。

## 3. dev 環境を有効にする

`parameter.ts` の `dev` ブロックは、CDK context の `env` が `dev` の場合だけ使用される。

継続的に `dev` を使う場合は、`packages/cdk/cdk.json` を次のようにする。

```json
{
  "context": {
    "env": "dev"
  }
}
```

一時的に切り替える場合は CDK コマンドへ `-c env=dev` を渡す。

```bash
npm run cdk:diff -- -c env=dev --profile rag-poc-admin
npm run cdk:deploy -- -c env=dev --profile rag-poc-admin
```

注意点として、このリポジトリの `packages/cdk/cdk.json` は現在 `"env": ""` である。そのままでは `parameter.ts` の `dev` 設定は選択されない。

また、`parameter.ts` に同名の環境がある場合、その環境ブロックが CDK context より優先される。`dev` 固有の別設定も必要なら、同じ `dev` ブロックへ追加する。

## 4. genU と外部 Runtime の入出力を合わせる

Runtime ARNを登録できても、外部ハンドラーの入出力形式がgenUと一致しなければ会話できない。

### genU が送る主なフィールド

genU は概ね次のJSONを `InvokeAgentRuntime` の `payload` として送る。

```json
{
  "messages": [],
  "system_prompt": "You are a helpful assistant.",
  "prompt": [{ "text": "名前を教えてください" }],
  "model": {
    "type": "bedrock",
    "modelId": "<genUで選択したモデルID>",
    "region": "ap-northeast-1"
  },
  "session_id": "<session-id>"
}
```

- `messages` は過去の会話で、初回でも空配列として含まれる
- 現在の入力は `prompt` に入り、文字列ではなく `{ "text": "..." }` の配列になることがある
- Runtime のリージョンは ARN から取得される
- モデルは genU の画面で選択した値が渡される

### genU が期待するストリーミング応答

genU は Strands のイベント形式を1行ずつ処理する。テキストは次のようなイベントで返す。

```json
{
  "event": {
    "contentBlockDelta": {
      "delta": {
        "text": "私の名前は別戸六区 英慈円斗です。"
      }
    }
  }
}
```

応答本文を独自の `{"message": "..."}` オブジェクトへ変換してから `delta.text` に入れると、そのJSON自体がチャット本文として表示される。通常は Strands の `event` をそのままストリームへ流す。

## 5. aws-agentcore-sample 側の互換性を確認する

対象ファイルは次のとおり。

```text
../aws-agentcore-sample/BedrockAgent/app/BedrockAgent/main.py
```

現在の `_extract_prompt` は `messages` キーが存在すると、空配列でも先に返す。genU は初回リクエストにも `messages: []` を含めるため、現在の `prompt` が無視される可能性がある。

少なくとも `prompt` の内容を優先する。

```python
def _extract_prompt(payload: dict):
    prompt = payload.get("prompt")
    if prompt:
        return prompt

    messages = payload.get("messages")
    if messages:
        return messages

    return ""
```

セッションIDも、genU の payload では `session_id` である。AgentCore の context にあるセッションIDをフォールバックとして使う。

```python
session_id = (
    payload.get("session_id")
    or payload.get("sessionId")
    or getattr(context, "session_id", "default-session")
)
```

ストリーミングでは、回答全体を独自JSONに包まず、Strandsが返した `event` をgenUへ渡す。

```python
async for event in agent.stream_async(prompt):
    if isinstance(event, dict) and "event" in event:
        yield event
```

複数ターンの会話履歴をgenUから復元したい場合は、`messages` をAgent作成時の履歴として渡したうえで、`prompt` を現在の入力として実行する。Runtime内のメモリだけに依存すると、コールドスタートや別プロセスへの振り分けで履歴が失われる可能性がある。

外部側を修正した場合は、`aws-agentcore-sample` から再デプロイして新バージョンを反映する。再デプロイで ARN が変わった場合は、genU の `parameter.ts` も更新する。

## 6. genU の権限が作成されることを確認する

genU の CDK は `agentCoreExternalRuntimes` の各 ARN に対して、Cognito Identity Pool の認証済みロールへ次の権限を追加する。

```json
{
  "Effect": "Allow",
  "Action": "bedrock-agentcore:InvokeAgentRuntime",
  "Resource": "<Runtime ARN>*"
}
```

このため、通常はgenU側でIAMポリシーを手作業で追加する必要はない。デプロイ後に `AccessDeniedException` が発生する場合は、次を確認する。

- `agentCoreExternalRuntimes` の ARN が正しい
- `env=dev` でデプロイされている
- CloudFormation が Cognito の認証済みロールを更新している
- genU と Runtime が同一アカウントである
- ブラウザで一度サインアウトし、サインインし直して新しい一時クレデンシャルを取得した

## 7. lint・ビルド・差分を確認する

```bash
npm -w packages/cdk run lint
npm -w packages/cdk run build
npm run cdk:diff -- -c env=dev --profile rag-poc-admin
```

### 日本語設定値と ESLint

genU には独自の `i18nhelper/no-jp-string` ルールがあり、翻訳されていない日本語の固定文字列を検出する。CDK の lint は `--max-warnings 0` のため、警告でもコミットが失敗する。

`display_name` と `description` は翻訳対象のUI固定文言ではなく、外部エージェント固有の設定値である。そのため、該当行だけ例外指定する。

```typescript
// eslint-disable-next-line i18nhelper/no-jp-string
display_name: '別戸六区 英慈円斗',
// eslint-disable-next-line i18nhelper/no-jp-string
description: '自分の名前を回答するサンプルエージェントです。',
```

コミット時に表示される `Unknown project config "min-release-age"` は npm の警告であり、今回のコミット失敗原因ではない。実際の失敗原因は日本語文字列に対する ESLint warning だった。

## 8. デプロイして動作確認する

```bash
npm run cdk:deploy -- -c env=dev --profile rag-poc-admin
```

デプロイ後は次の手順で確認する。

1. CloudFormation の `GenerativeAiUseCasesStackdev` が更新完了していることを確認する
2. genU の Web URL を開く
3. サインインする
4. 左メニューから「AgentCore」を開く
5. 一覧に「別戸六区 英慈円斗」が表示されることを確認する
6. エージェントを開き、利用可能なモデルを選択する
7. 「あなたの名前を教えてください」と送信する
8. 「別戸六区 英慈円斗」を含む回答が返ることを確認する

ブラウザが古いフロントエンドを保持している場合は、ハードリロードまたはキャッシュ削除を行う。

## トラブルシューティング

### AgentCore メニューまたはエージェントが表示されない

- `cdk.json` の `env`、またはデプロイ時の `-c env=dev` を確認する
- `agentCoreExternalRuntimes` が空になっていないか確認する
- CDKデプロイ後のフロントエンドへアクセスしているか確認する

### `AccessDeniedException` になる

- ARN、アカウント、リージョンを確認する
- Cognito の認証済みロールに `bedrock-agentcore:InvokeAgentRuntime` が追加されたか確認する
- サインインし直して一時クレデンシャルを更新する

### 入力しても回答がない

- 外部 Runtime のログを CloudWatch Logs で確認する
- 外部ハンドラーが空の `messages` ではなく `prompt` を処理しているか確認する
- `prompt` が文字列だけでなくテキストブロック配列にも対応しているか確認する
- Runtime が genU の選択モデルを利用できるIAM権限を持つか確認する

### 回答欄にJSONがそのまま表示される

- `delta.text` に `{"message": ...}` のような独自レスポンス全体を入れていないか確認する
- Strands のストリーミング `event` をそのまま返す

### コミット時の lint が失敗する

```bash
npm -w packages/cdk run lint
```

上記を単独実行して実際の警告箇所を確認する。日本語のエージェント固有設定値には、行単位の `eslint-disable-next-line` を使用する。

## 関連する実装

| 役割                           | ファイル                                                        |
| ------------------------------ | --------------------------------------------------------------- |
| 外部 Runtime の登録            | `packages/cdk/parameter.ts`                                     |
| 設定スキーマ                   | `packages/cdk/lib/stack-input.ts`                               |
| Cognito ロールへの権限付与     | `packages/cdk/lib/construct/agent-core.ts`                      |
| フロントエンド環境変数への登録 | `packages/cdk/lib/construct/web.ts`                             |
| Runtime一覧と呼び出し準備      | `packages/web/src/hooks/useAgentCore.ts`                        |
| AgentCore SDKによる直接呼出し  | `packages/web/src/hooks/useAgentCoreApi.ts`                     |
| ストリーム応答の処理           | `packages/web/src/utils/strandsUtils.ts`                        |
| 外部 Runtime のハンドラー      | `../aws-agentcore-sample/BedrockAgent/app/BedrockAgent/main.py` |
