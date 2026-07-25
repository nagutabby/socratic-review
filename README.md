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
- **⚙️ 柔軟な深度・実行オプション**
  - `--depth`: レビューの深さ調整 (`quick`: 3問 / `standard`: 7問 / `deep`: 15問)
  - `--focus`: 特定のコンポーネントや関数に絞ったレビュー
  - `--non-interactive`: CI/CD や非対話環境での自己完結レポート生成
  - `--write-decisions`: 合意事項を `DECISIONS.md` へ自動記録

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
- **`scripts/`**: 状態管理・差分取得用シェルスクリプト
  - `read-readme.sh`: README 情報の抽出
  - `fetch-diff.sh`: diff の取得とタグ自動分類
  - `validate-state.sh`: 状態ファイル (`.claude/socratic-state.json`) の検証・永続化
  - `write-decisions.sh`: 解決済み問いの `DECISIONS.md` への書き出し

---

## 🏃 使い方 (Claude Code 内)

### 基本実行
Claude Code のチャット上で以下のように呼び出します。

```bash
/socratic-review
```

### オプションを指定した実行

```bash
# サクッと3問だけ確認したい場合
/socratic-review --depth=quick

# 特定の認証モジュールに集中してレビューしたい場合
/socratic-review --focus="src/auth"

# レビュー完了後に合意事項を DECISIONS.md に記録したい場合
/socratic-review --write-decisions
```

---

## 🧪 テスト・評価（Evals）基盤

本リポジトリでは、**Vitest** と **Gemini 3.1 Flash-Lite** (`temperature: 0`) を組み合わせた Evals (評価) テスト基盤を備えています。実ファイル (`.md`) 内のシステムプロンプトを動的に注入して自動検証します。

### 必要な環境変数
テストの実行には Gemini API キーが必要です。

```bash
export GEMINI_API_KEY="your-gemini-api-key"
```

### テストの実行

```bash
# 依存関係のインストール
pnpm install

# 全テストの実行 (単体テスト・結合テスト・シェルスクリプトテスト)
pnpm test

# 実行例:
# - tests/unit/agents.test.ts   (サブエージェント単体テスト)
# - tests/unit/scripts.test.ts  (シェルスクリプト単体テスト)
# - tests/integration/orchestrator.test.ts (メインフロー結合テスト)
```
