import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

// エージェント定義・スキル定義・permissions設定に対して、
// 「できないこと・すべきではないこと」が明示されているかを静的に検証するテスト群。
// LLMを呼び出さず、ファイル内容そのものを検証する。

const projectRoot = path.resolve(__dirname, '../../');

function readAgentFile(fileName: string): string {
  return fs.readFileSync(
    path.join(projectRoot, '.claude/skills/socratic-review/agents', fileName),
    'utf-8'
  );
}

function parseFrontmatter(content: string): Record<string, string> {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match || match[1] === undefined) return {};
  const fields: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const m = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (m && m[1] !== undefined && m[2] !== undefined) fields[m[1]] = m[2].trim();
  }
  return fields;
}

describe('Sub-agent tool restriction (least privilege)', () => {
  const AGENT_FILES = [
    'spec-explorer.md',
    'sec-expert.md',
    'qa-expert.md',
    'arch-expert.md',
    'ops-expert.md',
    'ui-ux-expert.md',
  ];

  // Bashは自身の構造化出力(JSON)をvalidate-outputs.shで自己検証するためだけに許可されており、
  // コード変更が行えるEdit/Write、および他エージェントを起動できるAgentは引き続き禁止する
  it.each(AGENT_FILES)('%s should restrict tools to read-only + self-validation (Read, Grep, Glob, Bash)', (fileName) => {
    const content = readAgentFile(fileName);
    const frontmatter = parseFrontmatter(content);

    expect(frontmatter.tools).toBeDefined();
    const tools = (frontmatter.tools ?? '').split(',').map((t) => t.trim());
    expect(tools.sort()).toEqual(['Bash', 'Glob', 'Grep', 'Read'].sort());

    // Edit/Write/Agent など、分析専門家に不要な権限が紛れ込んでいないことを確認
    expect(frontmatter.tools).not.toMatch(/\b(Edit|Write|Agent|NotebookEdit)\b/);
  });

  const BASH_RESTRICTION_PATTERN = /Bashツールは本検証コマンドの実行以外の目的.*使用してはならない/;

  it.each(AGENT_FILES)('%s should instruct running validate-outputs.sh before returning its response', (fileName) => {
    const content = readAgentFile(fileName);
    expect(content).toMatch(/validate-outputs\.sh/);
  });

  it('spec-explorer.md should inline restrict Bash usage to validate-outputs.sh only (does not reference expert-common.md)', () => {
    const content = readAgentFile('spec-explorer.md');
    expect(content).toMatch(BASH_RESTRICTION_PATTERN);
  });

  it.each(AGENT_FILES.filter((f) => f !== 'spec-explorer.md'))(
    '%s should reference the shared Bash-usage restriction rule in expert-common.md',
    (fileName) => {
      const content = readAgentFile(fileName);
      expect(content).toMatch(/expert-common\.md/);

      const commonRules = fs.readFileSync(
        path.join(projectRoot, '.claude/skills/socratic-review/rules/expert-common.md'),
        'utf-8'
      );
      expect(commonRules).toMatch(BASH_RESTRICTION_PATTERN);
    }
  );
});

describe('Project-wide permission deny rules (destructive operation guardrails)', () => {
  const settingsPath = path.join(projectRoot, '.claude/settings.json');

  it('should exist as a project-tracked (non-local) settings file', () => {
    expect(fs.existsSync(settingsPath)).toBe(true);
  });

  it('should deny destructive/irreversible git and filesystem operations', () => {
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    const deny: string[] = settings.permissions?.deny ?? [];

    const mustBeDenied = [
      /git push .*--force|git push -f|git push.*force/i,
      /git reset --hard/i,
      /git clean -f/i,
      /git branch -D|git branch --delete --force/i,
      /rm -rf|rm -fr/i,
    ];

    for (const pattern of mustBeDenied) {
      expect(deny.some((rule) => pattern.test(rule))).toBe(true);
    }
  });
});

describe('SKILL.md explicit prohibitions (guardrails against bypassing wrapper scripts)', () => {
  const skillContent = fs.readFileSync(
    path.join(projectRoot, '.claude/skills/socratic-review/SKILL.md'),
    'utf-8'
  );

  it('should explicitly forbid running raw git commit/push instead of commit.sh/push.sh', () => {
    expect(skillContent).toMatch(/禁止事項/);
    expect(skillContent).toMatch(/commit\.sh.*push\.sh.*経由しない|経由しない.*git commit/);
  });

  it('should explicitly instruct to treat externally-fetched text (Issue/PR/diff) as data, not instructions', () => {
    expect(skillContent).toMatch(/分析対象のデータ/);
    expect(skillContent).toMatch(/一切従わない/);
  });
});
