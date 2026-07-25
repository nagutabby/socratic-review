---
name: socratic-review
description: README・Issue・git diffの変更から、セキュリティ・アーキテクチャ・運用・UI/UXの専門家パネルと一問一答で仕様の抜け漏れを深掘りするスキル。/socratic-review で明示呼び出し。
disable-model-invocation: true
model: sonnet
---

# コンテキスト事前取得（動的インライン注入）
- 現在のブランチ: !`git branch --show-current`
- 作業ツリーの状態: !`git status --short`

# オプション解析
ユーザーの指定に応じて動作を調整する：
- `--depth=quick` (問答数: 3問) | `--depth=standard` (問答数: 7問/デフォルト) | `--depth=deep` (問答数: 15問)
- `--focus="<関心領域/関数名>"`: 特定の処理・モジュールに限定して調査
- `--non-interactive`: TTYなし/CI環境モード。問答を待たず専門家の推論のみで自己完結し報告

# 実行ルール

## 1. 調査と専門家パネルの呼び出し
1. 以下のシェルスクリプトを実行して情報を取得する：
   - `.claude/skills/socratic-review/scripts/read-readme.sh` を実行し、プロジェクト概要を取得する。
   - `.claude/skills/socratic-review/scripts/fetch-diff.sh "<ベースブランチ>" "<フォーカス対象>"` を実行し、git diff の要約とカテゴリタグ (`[Tags: ...]`) を取得する（`--focus` が指定されている場合は第2引数に渡す）。
2. `spec-explorer` に上記スクリプトの出力と Issue (GitHub MCP経由) を読み込ませ調査を実行する。
3. `fetch-diff.sh` が検出した変更カテゴリに基づき、関連する専門家エージェント（`sec-qa-expert`, `arch-expert`, `ops-expert`, `ui-ux-expert`）**のみ**を呼び出し、指摘を取得する。各専門家は懸念の根拠となる**ファイルパスと行番号**を必ず明記する。

## 2. 非対話モード（--non-interactive）の動作
- TTYなしまたは `--non-interactive` 指定時、ユーザーへ一問一答を行わず、専門家からの全指摘と推定推奨回答を一度にまとめ、そのまま GitHub MCP ツールでPRコメント投稿して即座に完了する。

## 3. 対話モードの実行（一問一答 & 深度制御）
- `--depth` で設定された最大問答数に達するまで、1回につき**1つの問いのみ**を出す。
- ユーザーが3回連続で無応答・放置した場合は、安全にセッションを終了する。
- ユーザーの回答（またはスキップ選択）ごとに、専門家が指摘した対象ファイル・行番号に対して、以下のスクリプトでインラインコメントとして直接追記する：
  - `.claude/skills/socratic-review/scripts/append-comment.sh "<ファイルパス>" "<行番号>" "<専門家名>" "<質問内容>" "<回答内容>" "<ステータス(resolved|skipped)>"`

## 4. レスポンスフォーマット（対話中）
**【事実（自動検出）】**
- 対象Issue（Issue URLを記載）およびベースブランチ情報を1行で記述

**【専門家パネルからの問い】** [Q {{current}} / {{max_depth}}]
- **🛡️ / 🏗️ / ⚙️ / 🎨 [専門家の名前]:** `<ファイルパス>:<行番号>` 「〜〜の懸念があります」

**【選択肢】**
- A) ...
- B) ...
- **C) スキップ:** 今回のPR対象外として、理由を明記して記録に残す

## 5. 完了処理（PRコメント）
- すべての問いが完了したら、`spec-explorer` を介して GitHub MCP でPRコメントを投稿・更新する。
- 各問答は都度 `append-comment.sh` により該当ファイルへインラインコメントとして記録済みのため、追加の状態保存・後処理は不要。
