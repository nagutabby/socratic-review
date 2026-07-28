import { describe, it, expect } from 'vitest';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

const ai = new GoogleGenAI({});
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

// .md から Frontmatter を除外してシステムプロンプトを読み込む関数
//
// 本番実行時、エージェントは Read ツールを使って `rules/*.md` の共通ルールを
// 自ら読み込む前提だが、このテストは Gemini API を直接呼び出すだけでツール実行を
// 伴わないため、エージェント本文が参照している rules/*.md があれば
// ここで代わりに読み込んでシステムプロンプトへ展開し、本番の挙動を再現する。
function loadSystemPrompt(agentFileName: string): string {
  const fullPath = path.resolve(`.claude/skills/socratic-review/agents/${agentFileName}`);
  const content = fs.readFileSync(fullPath, 'utf-8').replace(/^---[\s\S]*?---\n/, '').trim();

  const rulesDir = path.resolve('.claude/skills/socratic-review/rules');
  const referencedRuleFiles = [...content.matchAll(/rules\/([\w-]+\.md)/g)]
    .map((m) => m[1])
    .filter((name): name is string => name !== undefined);

  let expandedPrompt = content;
  for (const ruleFileName of new Set(referencedRuleFiles)) {
    const rulePath = path.join(rulesDir, ruleFileName);
    if (fs.existsSync(rulePath)) {
      const ruleContent = fs.readFileSync(rulePath, 'utf-8').trim();
      expandedPrompt += `\n\n---\n(rules/${ruleFileName} の内容)\n${ruleContent}`;
    }
  }
  return expandedPrompt;
}

// 汎用エージェント実行関数
async function runSubAgent(agentFileName: string, userPromptMock: string): Promise<string> {
  const systemPrompt = loadSystemPrompt(agentFileName);

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: userPromptMock,
    config: {
      systemInstruction: systemPrompt,
      temperature: 0,
    },
  });

  return response.text || '';
}

describe('All Sub-Agents Unit Tests (System Prompt Driven)', () => {

  // -------------------------------------------------------------
  // 1. spec-explorer.md のテスト
  // -------------------------------------------------------------
  describe('spec-explorer', () => {
    it('should correctly parse diff and extract relevant tags', async () => {
      const mockPrompt = `
以下の diff からタグと概要を抽出してください。
[diff]:
+ const user = req.body.user;
+ const query = "SELECT * FROM users WHERE id = '" + user + "'";
+ db.query(query);
`;
      const output = await runSubAgent('spec-explorer.md', mockPrompt);

      expect(output).toContain('[Tags:');
      expect(output).toMatch(/(Security|DB)/i);
    });
  });

  // -------------------------------------------------------------
  // 2. sec-expert.md のテスト
  // -------------------------------------------------------------
  describe('sec-expert', () => {
    it('should ask probing questions for SQL injection risks', async () => {
      const mockPrompt = 'SQLクエリの生成において、ユーザー入力文字列を直接結合しています。';
      const output = await runSubAgent('sec-expert.md', mockPrompt);

      expect(output).toContain('🛡️');
      expect(output).toMatch(/[？\?]/);
      expect(output).not.toContain('指摘なし');
    });

    it('should return "指摘なし" for non-security changes', async () => {
      const mockPrompt = 'ボタンのテキスト色を青から緑に変更しました。';
      const output = await runSubAgent('sec-expert.md', mockPrompt);

      expect(output).toContain('指摘なし');
    });
  });

  // -------------------------------------------------------------
  // 2b. qa-expert.md のテスト
  // -------------------------------------------------------------
  describe('qa-expert', () => {
    it('should ask probing questions for missing boundary/exception handling', async () => {
      const mockPrompt = '対象ファイル: src/utils/array.ts\nこの関数は配列が空の場合を考慮しておらず、例外処理も行っていません。';
      const output = await runSubAgent('qa-expert.md', mockPrompt);

      expect(output).toContain('🔍');
      expect(output).toMatch(/[？\?]/);
      expect(output).not.toContain('指摘なし');
    });

    it('should return "指摘なし" for non-boundary/exception changes', async () => {
      const mockPrompt = '認証トークンの発行ロジックを変更しました。';
      const output = await runSubAgent('qa-expert.md', mockPrompt);

      expect(output).toContain('指摘なし');
    });
  });

  // -------------------------------------------------------------
  // 3. arch-expert.md のテスト
  // -------------------------------------------------------------
  describe('arch-expert', () => {
    it('should ask probing questions for circular or tight coupling designs', async () => {
      const mockPrompt = 'UIコンポーネントの中から直接データベース接続ドライバーをインスタンス化してクエリを呼び出しています。';
      const output = await runSubAgent('arch-expert.md', mockPrompt);

      expect(output).toContain('🏛️');
      expect(output).toMatch(/[？\?]/);
      expect(output).not.toContain('指摘なし');
    });

    it('should return "指摘なし" for pure styling changes', async () => {
      const mockPrompt = '余白（padding）の調整のみを行いました。';
      const output = await runSubAgent('arch-expert.md', mockPrompt);

      expect(output).toContain('指摘なし');
    });
  });

  // -------------------------------------------------------------
  // 5. ops-expert.md のテスト
  // -------------------------------------------------------------
  describe('ops-expert', () => {
    it('should ask probing questions for missing error logging in async catch blocks', async () => {
      const mockPrompt = '外部API呼び出しの try-catch ブロックで、catch 節でエラーを握りつぶしログ出力を行っていません。';
      const output = await runSubAgent('ops-expert.md', mockPrompt);

      expect(output).toContain('⚙️');
      expect(output).toMatch(/[？\?]/);
      expect(output).not.toContain('指摘なし');
    });

    it('should return "指摘なし" when ops concerns do not exist', async () => {
      const mockPrompt = 'READMEの誤字脱字を修正しました。';
      const output = await runSubAgent('ops-expert.md', mockPrompt);

      expect(output).toContain('指摘なし');
    });
  });

  // -------------------------------------------------------------
  // 6. ui-ux-expert.md のテスト
  // -------------------------------------------------------------
  describe('ui-ux-expert', () => {
    it('should ask probing questions for missing aria-label or accessible features', async () => {
      const mockPrompt = 'アイコンのみの削除ボタンを追加しましたが、aria-label やテキスト注記がありません。';
      const output = await runSubAgent('ui-ux-expert.md', mockPrompt);

      expect(output).toContain('🎨');
      expect(output).toMatch(/[？\?]/);
      expect(output).not.toContain('指摘なし');
    });

    it('should return "指摘なし" for backend/SQL query optimizations', async () => {
      const mockPrompt = 'DBインデックスを追加してSELECTクエリを高速化しました。';
      const output = await runSubAgent('ui-ux-expert.md', mockPrompt);

      expect(output).toContain('指摘なし');
    });
  });

});
