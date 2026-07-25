import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

describe('Shell Scripts Unit Tests', () => {
  let tmpDir: string;
  // プロジェクトルート（.claude の親ディレクトリ）を動的に探す
  const projectRoot = path.resolve(__dirname, '../../');

  beforeEach(() => {
    // 各テストで隔離された一時ディレクトリを作成
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socratic-script-test-'));
  });

  afterEach(() => {
    // 一時ディレクトリのクリーンアップ
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ヘルパー関数: スクリプトを絶対パスで指定して一時ディレクトリ（cwd: tmpDir）上で実行する
  function runScript(scriptRelativePath: string, args: string[] = []): { stdout: string; exitCode: number; } {
    const scriptPath = path.join(projectRoot, scriptRelativePath);

    // スクリプト自体の存在確認
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Target script not found at path: ${scriptPath}`);
    }

    try {
      const stdout = execSync(`bash "${scriptPath}" ${args.map((a) => `"${a}"`).join(' ')}`, {
        cwd: tmpDir,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      });
      return { stdout: stdout.trim(), exitCode: 0 };
    } catch (error: any) {
      return {
        stdout: error.stdout ? error.stdout.toString().trim() : '',
        exitCode: error.status ?? 1,
      };
    }
  }

  // -------------------------------------------------------------
  // 1. read-readme.sh のテスト
  // -------------------------------------------------------------
  describe('read-readme.sh', () => {
    it('should report "README: None" when no README file exists', () => {
      // 空のディレクトリ状態で実行
      const res = runScript('.claude/skills/socratic-review/scripts/read-readme.sh');
      expect(res.stdout).toBe('README: None');
      expect(res.exitCode).toBe(0);
    });

    it('should detect README.md mock file and output headers and top content', () => {
      // README.md をモック作成
      const mockReadme = `# Project Title
概要テキスト

## Architecture
アーキテクチャの説明
`;
      fs.writeFileSync(path.join(tmpDir, 'README.md'), mockReadme);

      const res = runScript('.claude/skills/socratic-review/scripts/read-readme.sh');

      expect(res.stdout).toContain('=== README_SUMMARY (README.md) ===');
      expect(res.stdout).toContain('# Project Title');
      expect(res.stdout).toContain('## Architecture');
      expect(res.stdout).toContain('概要テキスト');
    });
  });

  // -------------------------------------------------------------
  // 2. fetch-diff.sh のテスト
  // -------------------------------------------------------------
  describe('fetch-diff.sh', () => {
    beforeEach(() => {
      // tmpDir を Git リポジトリとして初期化してダミーコミット
      execSync('git init && git config user.name "Test" && git config user.email "test@example.com"', { cwd: tmpDir });
      fs.writeFileSync(path.join(tmpDir, 'dummy.txt'), 'initial');
      execSync('git add . && git commit -m "initial"', { cwd: tmpDir });
    });

    it('should categorize Security and DB tags based on diff file paths', () => {
      // 変更ファイルをモック生成してコミット（diff が発生する状態を作る）
      fs.mkdirSync(path.join(tmpDir, 'src/db'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, 'src/auth'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'src/db/schema.prisma'), 'model User {}');
      fs.writeFileSync(path.join(tmpDir, 'src/auth/token.ts'), 'export const token = ""');
      execSync('git add . && git commit -m "add db and auth"', { cwd: tmpDir });

      const res = runScript('.claude/skills/socratic-review/scripts/fetch-diff.sh', ['HEAD~1']);

      expect(res.stdout).toContain('=== DIFF_SUMMARY ===');
      expect(res.stdout).toContain('src/db/schema.prisma');
      expect(res.stdout).toContain('src/auth/token.ts');
      expect(res.stdout).toContain('[Tags: DB,Security]');
    });

    it('should fallback to "Logic/General" when no specific keyword is matched', () => {
      fs.mkdirSync(path.join(tmpDir, 'src/utils'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'src/utils/helpers.ts'), 'export const add = (a,b) => a+b;');
      execSync('git add . && git commit -m "add helper"', { cwd: tmpDir });

      const res = runScript('.claude/skills/socratic-review/scripts/fetch-diff.sh', ['HEAD~1']);

      expect(res.stdout).toContain('[Tags: Logic/General]');
    });
  });

  // -------------------------------------------------------------
  // 3. validate-state.sh のテスト
  // -------------------------------------------------------------
  describe('validate-state.sh', () => {
    const getStatePath = () => path.join(tmpDir, '.claude/socratic-state.json');

    it('should return NOT_FOUND when state file does not exist', () => {
      const res = runScript('.claude/skills/socratic-review/scripts/validate-state.sh', ['validate']);
      expect(res.stdout).toBe('NOT_FOUND');
    });

    it('should initialize state file correctly on "init"', () => {
      const issueUrl = 'https://github.com/example/repo/issues/42';
      const res = runScript('.claude/skills/socratic-review/scripts/validate-state.sh', ['init', issueUrl]);

      expect(res.stdout).toContain('INITIALIZED: .claude/socratic-state.json');
      expect(fs.existsSync(getStatePath())).toBe(true);

      const content = JSON.parse(fs.readFileSync(getStatePath(), 'utf-8'));
      expect(content.version).toBe('1.0');
      expect(content.issue_url).toBe(issueUrl);
      expect(content.status).toBe('in_progress');
    });

    it('should return VALID after initialization when validated', () => {
      runScript('.claude/skills/socratic-review/scripts/validate-state.sh', ['init', 'https://github.com/example/repo/issues/1']);
      const res = runScript('.claude/skills/socratic-review/scripts/validate-state.sh', ['validate']);

      expect(res.stdout).toBe('VALID');
    });

    it('should append Q&A item into json on "append"', () => {
      runScript('.claude/skills/socratic-review/scripts/validate-state.sh', ['init', 'https://github.com/example/repo/issues/1']);

      const res = runScript('.claude/skills/socratic-review/scripts/validate-state.sh', [
        'append',
        'sec-qa-expert',
        'SQLインジェクションの対策は？',
        'プレースホルダーを使用します',
        'resolved',
      ]);

      expect(res.stdout).toBe('APPENDED');

      const content = JSON.parse(fs.readFileSync(getStatePath(), 'utf-8'));
      expect(content.qa_list).toHaveLength(1);
      expect(content.qa_list[0]).toEqual({
        expert: 'sec-qa-expert',
        question: 'SQLインジェクションの対策は？',
        answer: 'プレースホルダーを使用します',
        status: 'resolved',
      });
    });
  });

  // -------------------------------------------------------------
  // 4. write-decisions.sh のテスト
  // -------------------------------------------------------------
  describe('write-decisions.sh', () => {
    it('should fail with exit code 1 if state file does not exist', () => {
      const res = runScript('.claude/skills/socratic-review/scripts/write-decisions.sh');
      expect(res.exitCode).toBe(1);
      expect(res.stdout).toContain('ERROR: State file not found.');
    });

    it('should append resolved Q&As from state mock file into DECISIONS.md', () => {
      // 1. .claude/socratic-state.json のモックファイルを配置
      fs.mkdirSync(path.join(tmpDir, '.claude'), { recursive: true });
      const mockStateData = {
        version: '1.0',
        issue_url: 'https://github.com/example/repo/issues/1',
        status: 'in_progress',
        qa_list: [
          {
            expert: 'sec-qa-expert',
            question: 'SQLインジェクションの対策は？',
            answer: 'パラメータ化クエリを使用',
            status: 'resolved',
          },
          {
            expert: 'ops-expert',
            question: 'スキップされた質問',
            answer: 'スキップ理由',
            status: 'skipped',
          },
        ],
      };
      fs.writeFileSync(path.join(tmpDir, '.claude/socratic-state.json'), JSON.stringify(mockStateData, null, 2));

      // 2. DECISIONS.md の初期ファイルを作成
      const decisionsPath = path.join(tmpDir, 'DECISIONS.md');
      fs.writeFileSync(decisionsPath, '# Architecture Decisions\n');

      // 3. write-decisions.sh 実行
      const res = runScript('.claude/skills/socratic-review/scripts/write-decisions.sh');

      expect(res.exitCode).toBe(0);
      expect(res.stdout).toBe('WRITTEN_TO_DECISIONS: DECISIONS.md');

      // 4. DECISIONS.md の結果検証
      const decisionsContent = fs.readFileSync(decisionsPath, 'utf-8');
      expect(decisionsContent).toContain('## Architecture Decision -');
      expect(decisionsContent).toContain('- **Q (sec-qa-expert):** SQLインジェクションの対策は？');
      expect(decisionsContent).toContain('- **Decision:** パラメータ化クエリを使用');
      expect(decisionsContent).not.toContain('スキップされた質問');
    });
  });
});
