import { describe, it, expect } from 'vitest';
import { GoogleGenAI } from '@google/genai';
import { Levenshtein } from 'autoevals';
import * as fs from 'fs';
import * as path from 'path';

const ai = new GoogleGenAI({});
const MODEL_NAME = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

function loadSystemPrompt(filePath: string): string {
  const fullPath = path.resolve(filePath);
  const content = fs.readFileSync(fullPath, 'utf-8');
  return content.replace(/^---[\s\S]*?---\n/, '').trim();
}

async function runMainSocraticSkill(userPromptMock: string): Promise<string> {
  // SKILL.md をシステムプロンプトとして読み込み
  const systemPrompt = loadSystemPrompt(
    '.claude/skills/socratic-review/SKILL.md'
  );

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

describe('Main Socratic Skill Integration Test (SKILL.md System Prompt)', () => {
  it('should accept mocked user diff and produce initial Socratic question formatted correctly', async () => {
    // ユーザープロンプトのモック
    const userPromptMock = `
/socratic-review --depth=quick --issue="https://github.com/example/example/issues/1"

[モック環境情報]:
- カレントブランチ: feature/auth-login
- git diff:
  diff --git a/src/auth.ts b/src/auth.ts
  + const query = "SELECT * FROM users WHERE username = '" + user + "'";
  + return db.execute(query);
`;

    const agentOutput = await runMainSocraticSkill(userPromptMock);

    console.log('\n--- Orchestrator Output (SKILL.md) ---');
    console.log(agentOutput);
    console.log('--------------------------------------\n');

    // フォーマット検証
    expect(agentOutput).toContain('【事実（自動検出）】');
    expect(agentOutput).toContain('【専門家パネルからの問い】');
    expect(agentOutput).toContain('【選択肢】');
    expect(agentOutput).toMatch(/-\s*\*{0,2}A\)/);
    expect(agentOutput).toMatch(/-\s*\*{0,2}B\)/);
    expect(agentOutput).toMatch(/-\s*\*{0,2}C\) 意図通り/);

    // autoevals によるスケルトン一致評価
    const expectedSkeleton = '【事実（自動検出）】\n【専門家パネルからの問い】\n【選択肢】\n- A)\n- B)\n- C) 意図通り';
    const levenshteinEval = await Levenshtein({
      output: agentOutput,
      expected: expectedSkeleton,
    });

    expect(levenshteinEval.score).toBeGreaterThan(0);
  });
});
