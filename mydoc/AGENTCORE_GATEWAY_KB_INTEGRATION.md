# 外部エージェントから AgentCore Gateway 経由で Knowledge Base を参照する

## 目的

genU から呼び出す外部 AgentCore Runtime に、マニュアルの内容を回答させる。
Runtime が AgentCore Gateway を MCP ツールとして呼び、Gateway が Managed Knowledge Base
を検索する。

```text
genU (aws-genu-bedrock-kb-poc)
  ↓ InvokeAgentRuntime (Cognito 認証済みユーザーの一時クレデンシャル)
AgentCore Runtime  BedrockAgent_BedrockAgent   ← aws-agentcore-sample
  ↓ MCP over streamable HTTP + IAM (SigV4) / 実行ロール
AgentCore Gateway  sample-manual-gw
  ↓ Knowledge Base Connector
Managed Knowledge Base  sample-manual-kb
```

genU 側のコードは変更していない。genU から見ると Runtime を呼ぶだけで、KB 参照は
Runtime の内部で完結する。

## 対象リソース (ap-northeast-1 / アカウント 035351467732)

| リソース       | 値                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------ |
| Runtime        | `BedrockAgent_BedrockAgent-052O95DjiR`                                                           |
| Gateway        | `sample-manual-gw-s08lru8q3m`                                                                    |
| Gateway URL    | `https://sample-manual-gw-s08lru8q3m.gateway.bedrock-agentcore.ap-northeast-1.amazonaws.com/mcp` |
| Gateway 認証   | `AWS_IAM` (SigV4)                                                                                |
| Gateway ARN    | `arn:aws:bedrock-agentcore:ap-northeast-1:035351467732:gateway/sample-manual-gw-s08lru8q3m`      |
| Knowledge Base | `sample-manual-kb` (`UFPZW5A69W`)                                                                |
| 公開ツール名   | `target-quick-start-b083cf___Retrieve`                                                           |

Gateway と Knowledge Base は AgentCore CLI プロジェクトの外で作成済みのため、
`agentcore.json` の `agentCoreGateways` / `knowledgeBases` は空のままでよい。

## 実装 (aws-agentcore-sample 側)

変更は外部リポジトリ `/Users/nt/projects/aws-agentcore-sample` に閉じている。

| ファイル                                | 変更内容                                                                |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `app/BedrockAgent/pyproject.toml`       | `mcp-proxy-for-aws` を追加 (SigV4 署名付き MCP トランスポート)          |
| `app/BedrockAgent/mcp_client/client.py` | 接続先をサンプルの Exa MCP から AgentCore Gateway (IAM 認証) へ差し替え |
| `app/BedrockAgent/main.py`              | システムプロンプト更新 + 起動時のツール一覧ログ                         |
| `agentcore/agentcore.json`              | `envVars` で Gateway URL、`connections` で Gateway 接続を宣言           |
| `README.md`                             | 構成・環境変数・IAM・ローカル起動・デプロイ・動作確認                   |

### 環境変数

| 変数                    | 必須         | 説明                                                             |
| ----------------------- | ------------ | ---------------------------------------------------------------- |
| `AGENTCORE_GATEWAY_URL` | 必須         | Gateway の MCP エンドポイント。未設定なら Gateway なしで起動する |
| `AWS_REGION`            | 必須         | SigV4 署名に使うリージョン。Runtime では自動注入される           |
| `AWS_PROFILE`           | ローカルのみ | Runtime では未設定にし、実行ロールの認証情報を使う               |

デプロイ時の `AGENTCORE_GATEWAY_URL` は `agentcore.json` の `runtimes[].envVars` で渡す。

## ハマりどころ

### 1. Knowledge Base Tool のハードコードは不要

Strands の `MCPClient` は `ToolProvider` を実装しており、Strands の tool registry が
`ToolProvider` を受け付ける。したがって `Agent(tools=[mcp_client])` と渡すだけで、
Gateway が公開するツールを自動で検出し、セッションのライフサイクルも Strands が管理する。

ツール名 (`target-quick-start-b083cf___Retrieve`) を書く必要はない。Gateway 側のツールが
増減してもエージェントのコード変更は不要。

### 2. Agent に渡す MCPClient を手動で start() してはいけない

`MCPClient.start()` はセッションが稼働中だと `MCPClientInitializationError` を投げる。
一方 `ToolProvider.load_tools()` は内部で `start()` を呼ぶ。

つまり「起動時にツール一覧をログ出力したいから」と Agent に渡すクライアントを先に
`start()` すると、後で Agent 側の `start()` が失敗する。

ログ用には使い捨ての別インスタンスを使う。

```python
def _log_available_tools() -> None:
    probe = get_streamable_http_mcp_client()   # Agent に渡すものとは別インスタンス
    if probe is None:
        return
    with probe:
        names = [t.tool_name for t in probe.list_tools_sync()]
    log.info("Gateway tools (%d): %s", len(names), ", ".join(names))
```

### 3. IAM 権限は手書きせず connections で宣言する

Gateway は IAM 認証のため、Runtime の実行ロールに `bedrock-agentcore:InvokeGateway` が
必要。これが無いと `AccessDeniedException` になる。デプロイ前の実行ロールにはこの権限が
無かった。

ポリシーを手で書くのではなく、`agentcore.json` の `runtimes[].connections` で宣言すると、
AgentCore CDK が実行ロールへ IAM 権限を自動生成する。

```json
"connections": [
  {
    "id": "sample-manual-gateway",
    "to": {
      "type": "gateway",
      "arn": "arn:aws:bedrock-agentcore:ap-northeast-1:035351467732:gateway/sample-manual-gw-s08lru8q3m",
      "outboundAuth": { "awsIam": {} }
    }
  }
]
```

`outboundAuth: { awsIam: {} }` は「実行ロールの認証情報で SigV4 署名して Gateway を呼ぶ」
という意味で、Gateway 側の inbound 認証 (`AWS_IAM`) と対になる。

Knowledge Base の検索は Gateway のサービスロールが実行するため、Runtime ロール側に
`bedrock:Retrieve` は不要。

### 4. ローカル起動は `agentcore dev`

`agentcore run` は評価 (evaluation) 実行用のコマンドで、ローカル起動ではない。
ローカルで動かすのは `agentcore dev`。

### 5. agentcore CLI は SSO プロファイルを解決しない

`agentcore deploy` は env の静的キーしか読まないため、`AWS_PROFILE` に SSO プロファイルを
指定しても "No AWS credentials configured" になる。一時クレデンシャルを env に展開してから
実行する。

```bash
eval "$(aws configure export-credentials --profile rag-poc-admin --format env)"
agentcore deploy --target dev -y -v
```

### 6. boto3 の SSO トークンは別途失効する

`aws sts get-caller-identity` (AWS CLI) が通っても、boto3 側は
`TokenRetrievalError: Token has expired and refresh failed` になることがある。
Gateway 接続は boto3 を使うため、この場合は再ログインする。

```bash
aws sso login --profile rag-poc-admin
```

## 動作確認

### ローカル

```bash
cd /Users/nt/projects/aws-agentcore-sample/BedrockAgent
export AWS_REGION=ap-northeast-1
export AWS_PROFILE=rag-poc-admin
export AGENTCORE_GATEWAY_URL="https://sample-manual-gw-s08lru8q3m.gateway.bedrock-agentcore.ap-northeast-1.amazonaws.com/mcp"

agentcore dev
```

### デプロイ済み Runtime

genU の画面 (AgentCore → 別戸六区 英慈円斗) から質問する。期待する結果は次のとおり。

```text
Q: あなたの名前は？      → 別戸六区 英慈円斗です。            (システムプロンプト)
Q: システム利用時間は？  → 平日の午前8時から午後6時まで        (Knowledge Base)
Q: 担当者は？            → 別戸六区 英慈円斗です。            (Knowledge Base)
```

マニュアルに無い内容は、推測せず「マニュアルに記載が無い」と回答する。

## トラブルシューティング

CloudWatch Logs のロググループは
`/aws/bedrock-agentcore/runtimes/BedrockAgent_BedrockAgent-052O95DjiR-DEFAULT`。

| 症状                                 | 確認すること                                                                  |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| `AccessDeniedException`              | 実行ロールに `bedrock-agentcore:InvokeGateway` があるか                       |
| `AGENTCORE_GATEWAY_URL is not set`   | Runtime の環境変数 (`agentcore.json` の `envVars`)                            |
| `Gateway tools (0)` / ツール一覧が空 | Gateway のターゲット (KB Connector) の状態                                    |
| KB を無視して推測で答える            | システムプロンプトが反映されているか (再デプロイ漏れ)                         |
| 回答が空になる                       | [EXTERNAL_AGENTCORE_INTEGRATION.md](EXTERNAL_AGENTCORE_INTEGRATION.md) を参照 |

起動ログに次が出ていれば Gateway 接続は成功している。

```text
Gateway tools (1): target-quick-start-b083cf___Retrieve
```

## 関連する実装

| 役割                         | ファイル                                                                     |
| ---------------------------- | ---------------------------------------------------------------------------- |
| genU への外部 Runtime 登録   | `packages/cdk/parameter.ts`                                                  |
| genU と Runtime の入出力仕様 | [EXTERNAL_AGENTCORE_INTEGRATION.md](EXTERNAL_AGENTCORE_INTEGRATION.md)       |
| Gateway 接続クライアント     | `../aws-agentcore-sample/BedrockAgent/app/BedrockAgent/mcp_client/client.py` |
| エージェント本体             | `../aws-agentcore-sample/BedrockAgent/app/BedrockAgent/main.py`              |
| Runtime の設定と IAM 宣言    | `../aws-agentcore-sample/BedrockAgent/agentcore/agentcore.json`              |
