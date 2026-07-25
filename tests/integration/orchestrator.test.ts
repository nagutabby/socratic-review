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

// agentOutput から見出しと選択肢の箇条書きプレフィックスのみを抜き出し、
// 本文の言い回し差を無視してフォーマット部分だけを比較できるようにする
function extractFormatSkeleton(text: string): string {
  // 見出しは **太字** で装飾されたり後ろに [Q 1/3] のような補足が
  // 付いたりするため、先頭一致で見出し本体だけを取り出す
  const headerPattern =
    /^\*{0,2}(【事実（自動検出）】|【専門家パネルからの問い】|【選択肢】)\*{0,2}/;
  const bulletPattern = /^-\s*\*{0,2}([ABC])\)\s*(意図通り)?/;

  const skeletonLines: string[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    const headerMatch = line.match(headerPattern);
    if (headerMatch) {
      skeletonLines.push(headerMatch[1]);
      continue;
    }
    const bulletMatch = line.match(bulletPattern);
    if (bulletMatch) {
      const [, letter, intended] = bulletMatch;
      skeletonLines.push(intended ? `- ${letter}) ${intended}` : `- ${letter})`);
    }
  }
  return skeletonLines.join('\n');
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
    // 本文（思考・問いかけ文）の分だけ編集距離が膨らまないよう、
    // 見出しと選択肢プレフィックスだけを抜き出してから比較する
    const expectedSkeleton = '【事実（自動検出）】\n【専門家パネルからの問い】\n【選択肢】\n- A)\n- B)\n- C) 意図通り';
    const actualSkeleton = extractFormatSkeleton(agentOutput);
    const levenshteinEval = await Levenshtein({
      output: actualSkeleton,
      expected: expectedSkeleton,
    });
    expect(levenshteinEval.score).toBeGreaterThan(0.9);
  });
});
