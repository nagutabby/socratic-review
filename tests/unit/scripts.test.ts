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
  // 3. append-comment.sh のテスト
  // -------------------------------------------------------------
  describe('append-comment.sh', () => {
    it('should fail with exit code 1 if target file does not exist', () => {
      const res = runScript('.claude/skills/socratic-review/scripts/append-comment.sh', [
        path.join(tmpDir, 'missing.js'),
        '1',
        'sec-qa-expert',
        '質問',
        '回答',
        'resolved',
      ]);
      expect(res.exitCode).toBe(1);
      expect(res.stdout).toContain('ERROR');
    });

    it('should insert a "//" comment before the target line in a .ts file', () => {
      const targetFile = path.join(tmpDir, 'token.ts');
      fs.writeFileSync(targetFile, 'function foo() {\n  return 1;\n}\n');

      const res = runScript('.claude/skills/socratic-review/scripts/append-comment.sh', [
        targetFile,
        '2',
        'sec-qa-expert',
        'SQLインジェクションの対策は？',
        'プレースホルダーを使用します',
        'resolved',
      ]);

      expect(res.stdout).toBe(`APPENDED: ${targetFile}:2`);

      const lines = fs.readFileSync(targetFile, 'utf-8').split('\n');
      expect(lines[1]).toContain('//');
      expect(lines[1]).toContain('[socratic-review]');
      expect(lines[1]).toContain('SQLインジェクションの対策は？');
      expect(lines[1]).toContain('プレースホルダーを使用します');
      expect(lines[2]).toBe('  return 1;');
    });

    it('should insert a "#" comment before the target line in a .py file', () => {
      const targetFile = path.join(tmpDir, 'app.py');
      fs.writeFileSync(targetFile, 'def foo():\n    return 1\n');

      const res = runScript('.claude/skills/socratic-review/scripts/append-comment.sh', [
        targetFile,
        '2',
        'ops-expert',
        'エラーログは必要か？',
        'スキップ',
        'skipped',
      ]);

      expect(res.stdout).toBe(`APPENDED: ${targetFile}:2`);

      const lines = fs.readFileSync(targetFile, 'utf-8').split('\n');
      expect(lines[1].trim().startsWith('#')).toBe(true);
      expect(lines[1]).toContain('skipped');
    });
  });
});
