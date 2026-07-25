# 🏛️ Socratic Review Skill (`/socratic-review`)

`socratic-review` は、GitHub Issue、README、および `git diff` の変更差分から、セキュリティ・アーキテクチャ・運用（Ops）・UI/UX の専門家パネルが対話形式（ソクラテス的問答）で仕様の抜け漏れや潜在的リスクを深掘りする Claude Code 用の拡張スキルです。

---

## 🌟 主な機能

- **🤖 専門家パネルによる自動判定**
  - `spec-explorer`: 差分解析・カテゴリ検出（DB, API, Security, UI/UX 等）
  - `sec-qa-expert`: セキュリティ脆弱性・境界値・例外系の指摘
  - `arch-expert`: モジュール境界・依存関係・保守性の指摘
  - `ops-expert`: 可観測性・ログ・エラーハンドリング・運用リスクの指摘
  - `ui-ux-expert`: アクセシビリティ・画面遷移・操作感の指摘
- **💬 一問一答（ソクラテス式）の問答インターフェース**
  - 「〜〜してください」という一方的な指示ではなく、開発者の思考を促す「問いかけ」形式でレビューを進行。
  - 各専門家の指摘には優先度（高 / 中 / 低）を付与し、**優先度の高い問いから順**にユーザーへ提示。
- **⚙️ 柔軟な深度・実行オプション**
  - `--depth`: レビューの深さ調整 (`quick`: 3問 / `standard`: 7問 / `deep`: 15問)。未指定の場合は対話形式で希望の問答数を確認（`--non-interactive` 時は `standard` を採用）。
  - `--focus`: 特定のコンポーネントや関数に絞ったレビュー
  - `--non-interactive`: TTYなし/CI環境モード。問答を待たず専門家の推論のみで自己完結し報告
- **📝 解決した問いをコードにインラインコメントとして記録**
  - 問いが解決するたびに、専門家が指摘した該当ファイル・行の直前へ質問と回答をコメントとして即座に追記。

---

## 🌐 インストール・グローバル設定（全リポジトリでの利用）

本スキルを任意のプロジェクト（あらゆる Git リポジトリ）から `/socratic-review` で呼び出せるようにするため、ホームディレクトリ配下の Claude 設定ディレクトリへシンボリックリンクを作成し、GitHub MCP サーバーをユーザー範囲（グローバル）で登録します。

### 1. リポジトリのクローン
まずは本リポジトリをローカルの任意の場所（例: `~/socratic-review`）にクローンします。

```bash
git clone https://github.com/your-username/socratic-review.git ~/socratic-review
```

### 2. スキルディレクトリのシンボリックリンク作成
`~/.claude/skills` ディレクトリに本スキルのディレクトリへのリンクを貼ります。

```bash
mkdir -p ~/.claude/skills
ln -s ~/socratic-review/.claude/skills/socratic-review ~/.claude/skills/socratic-review
```

### 3. GitHub Personal Access Token (Fine-grained) の取得
スキルが GitHub の Issue や Pull Request 情報を読み書きできるよう、アクセス権限を絞った Fine-grained PAT を作成します。

1. [GitHub Settings > Personal Access Tokens > Fine-grained tokens](https://github.com/settings/tokens?type=beta) にアクセスし、**「Generate new token」** をクリックします。
2. **Token name**（例: `claude-code-mcp`）と有効期限（Expiration）を設定します。
3. **Repository access** で対象のリポジトリ（`All repositories` または特定の対象リポジトリ）を選択します。
4. **Permissions** 内の **Repository permissions** を以下のように設定します：
   - **Issues**: `Read & Write`（Issue の参照・取得のため）
   - **Pull requests**: `Read & Write`（PR 差分参照・コメント投稿のため）
   - **Contents**: `Read-only`（ファイル内容・コード参照のため）
5. **「Generate token」** をクリックし、生成されたトークン（`github_pat_...`）をコピーします。

### 4. GitHub MCP サーバーのユーザー登録（`--scope user`）
取得した PAT を環境変数 `GITHUB_PERSONAL_ACCESS_TOKEN` として渡しながら、`claude mcp add` コマンドでグローバル（全プロジェクト共通）に登録します。

```bash
claude mcp add github \
  --scope user \
  -e GITHUB_PERSONAL_ACCESS_TOKEN="github_pat_your_token_here" \
  -- npx -y @modelcontextprotocol/server-github
```

---

## 📂 プロジェクト構造

📁 `.claude/skills/socratic-review/`
- **`SKILL.md`**: メインエージェント（オーケストレーター）の指示書
- **`agents/`**: 各専門家サブエージェントの定義 (`.md`)
  - `spec-explorer.md`
  - `sec-qa-expert.md`
  - `arch-expert.md`
  - `ops-expert.md`
  - `ui-ux-expert.md`
- **`scripts/`**: 差分取得・コメント記録用シェルスクリプト
  - `read-readme.sh`: README 情報の抽出
  - `fetch-diff.sh`: diff の取得とタグ自動分類
  - `append-comment.sh`: 解決済み問いを該当ファイルの該当行にインラインコメントとして追記

---

## 🏃 使い方 (Claude Code 内)

セットアップ完了後、**任意のリポジトリ上**で Claude Code を起動して使用できます。

### 基本実行
```bash
/socratic-review
```

### オプションを指定した実行

```bash
# サクッと3問だけ確認したい場合
/socratic-review --depth=quick

# 特定の認証モジュールに集中してレビューしたい場合
/socratic-review --focus="src/auth"
```

---

## 🧪 テスト・評価（Evals）基盤

本リポジトリ開発者向けに、**Vitest** と **Gemini 3.1 Flash-Lite** (`temperature: 0`) を組み合わせた自動評価（Evals）テスト基盤を備えています。実ファイル (`.md`) 内のシステムプロンプトを動的に注入して検証します。

### 必要な環境変数
```bash
export GEMINI_API_KEY="your-gemini-api-key"
```

### テストの実行

```bash
# 依存関係のインストール
pnpm install

# 全テストの実行 (単体テスト・結合テスト・シェルスクリプトテスト)
pnpm test
```

---
