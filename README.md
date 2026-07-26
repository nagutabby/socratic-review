# 🏛️ Socratic Review Skill (`/socratic-review`)

`socratic-review` は、GitHub Issue、README、および `git diff` の変更差分から、セキュリティ・QA・アーキテクチャ・運用（Ops）・UI/UX の専門家パネルが対話形式（ソクラテス式問答法）で仕様の抜け漏れや潜在的リスクを深掘りする Claude Code 用の拡張スキルです。

---

## 🌟 主な機能

- **🤖 専門家パネルによる自動判定**
  - `spec-explorer`: 差分解析・カテゴリ検出（Security, QA, Arch, Ops, UI/UX 等）
  - `sec-expert`: セキュリティ脆弱性・認証認可・データ漏洩の指摘
  - `qa-expert`: 境界値・例外系・エッジケースの指摘
  - `arch-expert`: モジュール境界・依存関係・保守性の指摘
  - `ops-expert`: 可観測性・ログ・エラーハンドリング・運用リスクの指摘
  - `ui-ux-expert`: アクセシビリティ・画面遷移・操作感の指摘
- **💬 一問一答（ソクラテス式）の問答インターフェース**
  - 「〜〜してください」という一方的な指示ではなく、開発者の思考を促す「問いかけ」形式でレビューを進行。
  - 各専門家の指摘には優先度（高 / 中 / 低）を付与し、**優先度の高い問いから順**にユーザーへ提示。
- **⚙️ 柔軟な深度・実行オプション**
  - `--issue`: 対象IssueのURLを事前指定。未指定の場合は調査開始前に対話形式でIssue URLを確認（`--non-interactive` 時は未指定だとエラー終了するため必須）。
  - `--depth`: レビューの深さ調整 (`quick`: 3問 / `standard`: 7問 / `deep`: 15問)。Issue URLの確定後、未指定の場合は対話形式で希望の問答数を確認（`--non-interactive` 時は `standard` を採用）。
  - `--focus`: 特定のコンポーネントや関数に絞ったレビュー
  - `--non-interactive`: TTYなし/CI環境モード。問答を待たず専門家の推論のみで自己完結し報告
- **📝 「意図通り」と判断した問いを意図のみコードにインラインコメントとして記録**
  - C（意図通り）を選択するたびに、専門家が指摘した該当ファイル・行の直前へ設計判断の意図のみを即座に追記。
- **✅ commit・push前の確認と保護ブランチガード**
  - すべての問いが完了した後、セッション中の修正内容を要約したコミットメッセージでcommit・pushするかどうかをユーザーに確認してから実行。
  - `main`・`master`・`develop` 上でのcommit、および現在の作業ブランチ以外へのpushは自動的に拒否される。

---

## 🌐 インストール・グローバル設定（全リポジトリでの利用）

本スキルを任意のプロジェクト（あらゆる Git リポジトリ）から `/socratic-review` で呼び出せるようにするため、ホームディレクトリ配下の Claude 設定ディレクトリへシンボリックリンクを作成し、GitHub CLI (`gh`) を認証済み状態にします。

### 1. リポジトリのクローン
まずは本リポジトリをローカルの任意の場所（例: `~/socratic-review`）にクローンします。

```bash
git clone git@github.com:nagutabby/socratic-review.git ~/socratic-review
```

### 2. スキルディレクトリのシンボリックリンク作成
`~/.claude/skills` ディレクトリに本スキルのディレクトリへのリンクを貼ります。

```bash
mkdir -p ~/.claude/skills
ln -s ~/socratic-review/.claude/skills/socratic-review ~/.claude/skills/socratic-review
```

### 3. GitHub CLI (`gh`) のインストールと認証
本スキルは Issue・Pull Request・リポジトリ内ファイルの取得に [GitHub CLI](https://cli.github.com/) (`gh` コマンド) を使用します。未インストールの場合は先にインストールしてください。

```bash
# macOS の例
brew install gh
```

インストール後、対象リポジトリへの `repo` スコープを含めてログインします。

```bash
gh auth login
```

ログイン状態は以下のコマンドで確認できます。

```bash
gh auth status
```

---

## 📂 プロジェクト構造

📁 `.claude/skills/socratic-review/`
- **`SKILL.md`**: メインエージェント（オーケストレーター）の指示書
- **`agents/`**: 各専門家サブエージェントの定義 (`.md`)
  - `spec-explorer.md`
  - `sec-expert.md`
  - `qa-expert.md`
  - `arch-expert.md`
  - `ops-expert.md`
  - `ui-ux-expert.md`
- **`scripts/`**: 差分取得・コメント記録・commit/push用シェルスクリプト
  - `get-doc-paths.sh`: README・ADR・Spec/設計ドキュメントのファイルパスと見出しアウトラインの取得
  - `fetch-diff.sh`: diff の取得とタグ自動分類
  - `fetch-pull-request.sh`: `gh` コマンド経由で現在ブランチに紐づく PR を取得
  - `fetch-issue.sh`: `gh` コマンド経由で明示指定された Issue URL/番号から Issue を取得
  - `append-comment.sh`: C（意図通り）を選択した問いについて、設計判断の意図のみを該当ファイルの該当行にインラインコメントとして追記
  - `commit.sh`: 修正内容を要約したコミットメッセージで現在の作業ブランチにcommit（`main`・`master`・`develop` 上での実行は拒否）
  - `push.sh`: 現在の作業ブランチに対応するリモートブランチへpush（保護ブランチへのpush、および現在の作業ブランチ以外へのpushは拒否）

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

# 対象IssueのURLを事前に指定する場合（--non-interactive時は必須）
/socratic-review --issue="https://github.com/your-org/your-repo/issues/123"
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
