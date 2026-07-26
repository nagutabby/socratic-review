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
    if (headerMatch && headerMatch[1] !== undefined) {
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

// 専門家パネルの問いの箇条書き行（例: "- **🛡️ [sec-expert]:** ..." や
// ブラケットなしの "- **🛡️ sec-expert:** ..." のような表記ゆれも許容）から
// アイコンと、そこに含まれる専門家名（5種類のうちどれが登場したか）を抽出する
// （SKILL.md 側のテンプレート行 "🛡️ / 🔍 / 🏛️ / ⚙️ / 🎨" のような
//  選択肢の羅列と区別するため、実際の問いの箇条書き行のみを対象にする）
const ALL_EXPERT_NAMES = ['sec-expert', 'qa-expert', 'arch-expert', 'ops-expert', 'ui-ux-expert'];

function extractExpertMentions(text: string): { icon: string; names: string[] }[] {
  const ICONS = ['🛡️', '🔍', '🏛️', '⚙️', '🎨'];
  const mentions: { icon: string; names: string[] }[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line.startsWith('-')) continue;
    const icon = ICONS.find((i) => line.includes(i));
    if (!icon) continue;
    const names = ALL_EXPERT_NAMES.filter((n) => line.includes(n));
    mentions.push({ icon, names });
  }
  return mentions;
}

// SKILL.md の「タグ→専門家エージェントの対応表」を検証するケース。
// fetch-diff.sh の出力（[Tags: ...]）をモックで直接与え、タグ検出そのものではなく
// 「そのタグに対して正しい専門家（アイコン・名前の両方）だけが呼ばれるか」という
// 対応表の決定論的な振る舞いのみを検証する。
const TAG_TO_EXPERT_CASES = [
  {
    tag: 'Security',
    expertIcon: '🛡️',
    expertName: 'sec-expert',
    file: 'src/auth/config.ts',
    diffBody: '+ const apiKey = "sk_live_1234567890abcdef";\n  + fetch(url, { headers: { Authorization: apiKey } });',
  },
  {
    tag: 'QA',
    expertIcon: '🔍',
    expertName: 'qa-expert',
    file: 'src/utils/divide.ts',
    diffBody: '+ function divide(a, b) {\n  +   return a / b;\n  + }',
  },
  {
    tag: 'Arch',
    expertIcon: '🏛️',
    expertName: 'arch-expert',
    file: 'src/core/orderService.ts',
    diffBody: '+ class OrderService {\n  +   constructor() {\n  +     this.db = new PostgresClient();\n  +   }\n  + }',
  },
  {
    tag: 'Ops',
    expertIcon: '⚙️',
    expertName: 'ops-expert',
    file: 'src/services/paymentService.ts',
    diffBody: '+ try {\n  +   await chargeCard(orderId);\n  + } catch (e) {\n  +   // エラーを握りつぶす\n  + }',
  },
  {
    tag: 'UI/UX',
    expertIcon: '🎨',
    expertName: 'ui-ux-expert',
    file: 'src/components/DeleteButton.tsx',
    diffBody: '+ <button onClick={onDelete}>\n  +   <TrashIcon />\n  + </button>',
  },
  {
    tag: 'Logic/General',
    expertIcon: '🔍',
    expertName: 'qa-expert',
    file: 'src/lib/arrayUtils.ts',
    diffBody: '+ function first(arr) {\n  +   return arr[0];\n  + }',
  },
];

describe('Category Tag -> Expert Dispatch (SKILL.md Tag Table)', () => {
  it.each(TAG_TO_EXPERT_CASES)(
    'should dispatch only the expert mapped to the $tag tag',
    async ({ tag, expertIcon, expertName, file, diffBody }) => {
      const userPromptMock = `
/socratic-review --depth=quick --issue="https://github.com/example/example/issues/1"

[モック環境情報]:
- カレントブランチ: feature/mock
- fetch-diff.sh の出力:
  === DIFF_SUMMARY ===
  Changed Files:
  ${file}

  === CATEGORY_TAGS ===
  [Tags: ${tag}]
- git diff:
  diff --git a/${file} b/${file}
  ${diffBody}
`;

      const agentOutput = await runMainSocraticSkill(userPromptMock);

      const mentions = extractExpertMentions(agentOutput);
      expect(mentions.length).toBeGreaterThan(0);
      expect(
        mentions.every((m) => m.icon === expertIcon && m.names.length === 1 && m.names[0] === expertName)
      ).toBe(true);
    },
    20000
  );
});

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
