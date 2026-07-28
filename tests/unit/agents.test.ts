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

// エージェントの出力（構造化出力のJSONオブジェクト1つのみのはず）から
// JSONオブジェクトを抜き出してパースする。コードフェンス等が付与されていても許容する。
function extractJson(output: string): any {
  const withoutFences = output.replace(/```json/gi, '').replace(/```/g, '');
  const match = withoutFences.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`出力からJSONオブジェクトを抽出できませんでした: ${output}`);
  }
  return JSON.parse(match[0]);
}

describe('All Sub-Agents Unit Tests (System Prompt Driven)', () => {

  // -------------------------------------------------------------
  // 1. spec-explorer.md のテスト
  // -------------------------------------------------------------
  describe('spec-explorer', () => {
    it('should correctly parse diff and extract relevant tags as structured JSON', async () => {
      const mockPrompt = `
以下の diff からタグと概要を抽出してください。
[diff]:
+ const user = req.body.user;
+ const query = "SELECT * FROM users WHERE id = '" + user + "'";
+ db.query(query);
`;
      const output = await runSubAgent('spec-explorer.md', mockPrompt);
      const parsed = extractJson(output);

      expect(Array.isArray(parsed.tags)).toBe(true);
      expect(parsed.tags.length).toBeGreaterThan(0);
      expect(parsed.tags.some((tag: string) => /security|arch/i.test(tag))).toBe(true);
      expect(Array.isArray(parsed.files)).toBe(true);
      expect(parsed.files.length).toBeGreaterThan(0);
      expect(parsed.files[0].file_path).toBeTruthy();
      expect(parsed.files[0].summary).toBeTruthy();
    });
  });

  // -------------------------------------------------------------
  // 2. sec-expert.md のテスト
  // -------------------------------------------------------------
  describe('sec-expert', () => {
    it('should return a structured "finding" JSON with probing questions for SQL injection risks', async () => {
      const mockPrompt = 'SQLクエリの生成において、ユーザー入力文字列を直接結合しています。';
      const output = await runSubAgent('sec-expert.md', mockPrompt);
      const parsed = extractJson(output);

      expect(parsed.status).toBe('finding');
      expect(parsed.expert_icon).toBe('🛡️');
      expect(parsed.expert_name).toBe('セキュリティ専門家');
      expect(['高', '中', '低']).toContain(parsed.priority);
      expect(parsed.open_question).toMatch(/[？\?]/);
      expect(parsed.closed_question).toMatch(/[？\?]/);
    });

    it('should return status "no_finding" for non-security changes', async () => {
      const mockPrompt = 'ボタンのテキスト色を青から緑に変更しました。';
      const output = await runSubAgent('sec-expert.md', mockPrompt);
      const parsed = extractJson(output);

      expect(parsed.status).toBe('no_finding');
    });
  });

  // -------------------------------------------------------------
  // 2b. qa-expert.md のテスト
  // -------------------------------------------------------------
  describe('qa-expert', () => {
    it('should return a structured "finding" JSON with probing questions for missing boundary/exception handling', async () => {
      const mockPrompt = '対象ファイル: src/utils/array.ts\nこの関数は配列が空の場合を考慮しておらず、例外処理も行っていません。';
      const output = await runSubAgent('qa-expert.md', mockPrompt);
      const parsed = extractJson(output);

      expect(parsed.status).toBe('finding');
      expect(parsed.expert_icon).toBe('🔍');
      expect(parsed.expert_name).toBe('QA専門家');
      expect(['高', '中', '低']).toContain(parsed.priority);
      expect(parsed.open_question).toMatch(/[？\?]/);
      expect(parsed.closed_question).toMatch(/[？\?]/);
    });

    it('should return status "no_finding" for non-boundary/exception changes', async () => {
      const mockPrompt = '認証トークンの発行ロジックを変更しました。';
      const output = await runSubAgent('qa-expert.md', mockPrompt);
      const parsed = extractJson(output);

      expect(parsed.status).toBe('no_finding');
    });
  });

  // -------------------------------------------------------------
  // 3. arch-expert.md のテスト
  // -------------------------------------------------------------
  describe('arch-expert', () => {
    it('should return a structured "finding" JSON with probing questions for circular or tight coupling designs', async () => {
      const mockPrompt = 'UIコンポーネントの中から直接データベース接続ドライバーをインスタンス化してクエリを呼び出しています。';
      const output = await runSubAgent('arch-expert.md', mockPrompt);
      const parsed = extractJson(output);

      expect(parsed.status).toBe('finding');
      expect(parsed.expert_icon).toBe('🏛️');
      expect(parsed.expert_name).toBe('アーキテクチャ専門家');
      expect(['高', '中', '低']).toContain(parsed.priority);
      expect(parsed.open_question).toMatch(/[？\?]/);
      expect(parsed.closed_question).toMatch(/[？\?]/);
    });

    it('should return status "no_finding" for pure styling changes', async () => {
      const mockPrompt = '余白（padding）の調整のみを行いました。';
      const output = await runSubAgent('arch-expert.md', mockPrompt);
      const parsed = extractJson(output);

      expect(parsed.status).toBe('no_finding');
    });
  });

  // -------------------------------------------------------------
  // 5. ops-expert.md のテスト
  // -------------------------------------------------------------
  describe('ops-expert', () => {
    it('should return a structured "finding" JSON with probing questions for missing error logging in async catch blocks', async () => {
      const mockPrompt = '外部API呼び出しの try-catch ブロックで、catch 節でエラーを握りつぶしログ出力を行っていません。';
      const output = await runSubAgent('ops-expert.md', mockPrompt);
      const parsed = extractJson(output);

      expect(parsed.status).toBe('finding');
      expect(parsed.expert_icon).toBe('⚙️');
      expect(parsed.expert_name).toBe('運用/Ops専門家');
      expect(['高', '中', '低']).toContain(parsed.priority);
      expect(parsed.open_question).toMatch(/[？\?]/);
      expect(parsed.closed_question).toMatch(/[？\?]/);
    });

    it('should return status "no_finding" when ops concerns do not exist', async () => {
      const mockPrompt = 'READMEの誤字脱字を修正しました。';
      const output = await runSubAgent('ops-expert.md', mockPrompt);
      const parsed = extractJson(output);

      expect(parsed.status).toBe('no_finding');
    });
  });

  // -------------------------------------------------------------
  // 6. ui-ux-expert.md のテスト
  // -------------------------------------------------------------
  describe('ui-ux-expert', () => {
    it('should return a structured "finding" JSON with probing questions for missing aria-label or accessible features', async () => {
      const mockPrompt = 'アイコンのみの削除ボタンを追加しましたが、aria-label やテキスト注記がありません。';
      const output = await runSubAgent('ui-ux-expert.md', mockPrompt);
      const parsed = extractJson(output);

      expect(parsed.status).toBe('finding');
      expect(parsed.expert_icon).toBe('🎨');
      expect(parsed.expert_name).toBe('UI/UX専門家');
      expect(['高', '中', '低']).toContain(parsed.priority);
      expect(parsed.open_question).toMatch(/[？\?]/);
      expect(parsed.closed_question).toMatch(/[？\?]/);
    });

    it('should return status "no_finding" for backend/SQL query optimizations', async () => {
      const mockPrompt = 'DBインデックスを追加してSELECTクエリを高速化しました。';
      const output = await runSubAgent('ui-ux-expert.md', mockPrompt);
      const parsed = extractJson(output);

      expect(parsed.status).toBe('no_finding');
    });
  });

});
