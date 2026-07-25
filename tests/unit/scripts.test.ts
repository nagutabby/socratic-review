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
  function runScript(scriptRelativePath: string, args: string[] = [], env?: NodeJS.ProcessEnv): { stdout: string; exitCode: number; } {
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
        env: env ? { ...process.env, ...env } : process.env,
      });
      return { stdout: stdout.trim(), exitCode: 0 };
    } catch (error: any) {
      return {
        stdout: error.stdout ? error.stdout.toString().trim() : '',
        exitCode: error.status ?? 1,
      };
    }
  }

  // ヘルパー関数: 偽の `gh` コマンドを tmpDir 内に作成し、PATH の先頭に追加した実行環境を返す
  // (実際の GitHub API を叩かず、決定的に gh の挙動をスタブするため)
  function stubGh(script: string, extraEnv: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    const binDir = path.join(tmpDir, 'bin');
    fs.mkdirSync(binDir, { recursive: true });
    const ghPath = path.join(binDir, 'gh');
    fs.writeFileSync(ghPath, `#!/usr/bin/env bash\n${script}\n`, { mode: 0o755 });
    return { ...extraEnv, PATH: `${binDir}:${process.env.PATH}` };
  }

  // -------------------------------------------------------------
  // 1. read-docs.sh のテスト
  // -------------------------------------------------------------
  describe('read-docs.sh', () => {
    it('should report "README: None", "ADR: None" and "SPEC: None" when no doc exists', () => {
      // 空のディレクトリ状態で実行
      const res = runScript('.claude/skills/socratic-review/scripts/read-docs.sh');
      expect(res.stdout).toContain('README: None');
      expect(res.stdout).toContain('ADR: None');
      expect(res.stdout).toContain('SPEC: None');
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

      const res = runScript('.claude/skills/socratic-review/scripts/read-docs.sh');

      expect(res.stdout).toContain('=== README_SUMMARY (README.md) ===');
      expect(res.stdout).toContain('# Project Title');
      expect(res.stdout).toContain('## Architecture');
      expect(res.stdout).toContain('概要テキスト');
    });

    it('should detect ADR files under docs/adr and list them with their title', () => {
      fs.mkdirSync(path.join(tmpDir, 'docs/adr'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'docs/adr/0001-use-postgres.md'),
        '# 0001 Use PostgreSQL\n\n本文\n'
      );
      fs.writeFileSync(
        path.join(tmpDir, 'docs/adr/0002-use-grpc.md'),
        '# 0002 Use gRPC\n\n本文\n'
      );

      const res = runScript('.claude/skills/socratic-review/scripts/read-docs.sh');

      expect(res.stdout).toContain('=== ADR_SUMMARY ===');
      expect(res.stdout).toContain('Found 2 file(s)');
      expect(res.stdout).toContain('docs/adr/0001-use-postgres.md: 0001 Use PostgreSQL');
      expect(res.stdout).toContain('docs/adr/0002-use-grpc.md: 0002 Use gRPC');
    });

    it('should detect Spec files under a spec/ directory and list them with their title', () => {
      fs.mkdirSync(path.join(tmpDir, 'spec'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'spec/auth.md'), '# User Auth Spec\n\n本文\n');

      const res = runScript('.claude/skills/socratic-review/scripts/read-docs.sh');

      expect(res.stdout).toContain('=== SPEC_SUMMARY ===');
      expect(res.stdout).toContain('Found 1 file(s)');
      expect(res.stdout).toContain('spec/auth.md: User Auth Spec');
    });

    it('should truncate the ADR listing beyond 20 files', () => {
      fs.mkdirSync(path.join(tmpDir, 'docs/adr'), { recursive: true });
      for (let i = 1; i <= 25; i++) {
        const n = String(i).padStart(4, '0');
        fs.writeFileSync(path.join(tmpDir, `docs/adr/${n}-decision.md`), `# ${n} Decision\n`);
      }

      const res = runScript('.claude/skills/socratic-review/scripts/read-docs.sh');

      expect(res.stdout).toContain('Found 25 file(s)');
      expect(res.stdout).toContain('... (and 5 more, truncated)');
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
        '設計上意図的な実装です',
      ]);
      expect(res.exitCode).toBe(1);
      expect(res.stdout).toContain('ERROR');
    });

    it('should insert a "//" comment containing only the intent before the target line in a .ts file', () => {
      const targetFile = path.join(tmpDir, 'token.ts');
      fs.writeFileSync(targetFile, 'function foo() {\n  return 1;\n}\n');

      const res = runScript('.claude/skills/socratic-review/scripts/append-comment.sh', [
        targetFile,
        '2',
        'SQLインジェクション対策としてプレースホルダーを使用しているため意図的です',
      ]);

      expect(res.stdout).toBe(`APPENDED: ${targetFile}:2`);

      const lines = fs.readFileSync(targetFile, 'utf-8').split('\n');
      expect(lines[1]).toContain('//');
      expect(lines[1]).toContain('SQLインジェクション対策としてプレースホルダーを使用しているため意図的です');
      expect(lines[1]).not.toContain('[socratic-review]');
      expect(lines[2]).toBe('  return 1;');
    });

    it('should insert a "#" comment containing only the intent before the target line in a .py file', () => {
      const targetFile = path.join(tmpDir, 'app.py');
      fs.writeFileSync(targetFile, 'def foo():\n    return 1\n');

      const res = runScript('.claude/skills/socratic-review/scripts/append-comment.sh', [
        targetFile,
        '2',
        'ログ出力は不要と判断しているため意図的です',
      ]);

      expect(res.stdout).toBe(`APPENDED: ${targetFile}:2`);

      const lines = fs.readFileSync(targetFile, 'utf-8').split('\n');
      expect(lines[1].trim().startsWith('#')).toBe(true);
      expect(lines[1]).toContain('ログ出力は不要と判断しているため意図的です');
      expect(lines[1]).not.toContain('[socratic-review]');
    });
  });

  // -------------------------------------------------------------
  // 4. fetch-pull-request.sh のテスト（gh コマンドをスタブして検証）
  // -------------------------------------------------------------
  describe('fetch-pull-request.sh', () => {
    it('should report PR: None when no PR exists for the branch', () => {
      const env = stubGh('exit 1');

      const res = runScript('.claude/skills/socratic-review/scripts/fetch-pull-request.sh', [], env);

      expect(res.stdout).toContain('PR: None');
    });

    it('should print PR number, title, url and changed files', () => {
      const env = stubGh(`
if [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  echo '{"number":7,"title":"Fix bug","body":"Closes #42","url":"https://github.com/example/example/pull/7","files":[{"path":"src/a.ts"},{"path":"src/b.ts"}]}'
  exit 0
fi
exit 1
`);

      const res = runScript('.claude/skills/socratic-review/scripts/fetch-pull-request.sh', [], env);

      expect(res.stdout).toContain('PR #7: Fix bug');
      expect(res.stdout).toContain('URL: https://github.com/example/example/pull/7');
      expect(res.stdout).toContain('- src/a.ts');
      expect(res.stdout).toContain('- src/b.ts');
    });
  });

  // -------------------------------------------------------------
  // 5. fetch-issue.sh のテスト（gh コマンドをスタブして検証）
  // -------------------------------------------------------------
  describe('fetch-issue.sh', () => {
    it('should exit with an error when no issue reference is given', () => {
      const res = runScript('.claude/skills/socratic-review/scripts/fetch-issue.sh', []);

      expect(res.exitCode).not.toBe(0);
    });

    it('should report ISSUE: NOT_FOUND when the given issue cannot be fetched', () => {
      const env = stubGh('exit 1');

      const res = runScript(
        '.claude/skills/socratic-review/scripts/fetch-issue.sh',
        ['https://github.com/example/example/issues/99'],
        env
      );

      expect(res.stdout).toContain('ISSUE: NOT_FOUND');
    });

    it('should fetch the issue directly when an issue URL is passed explicitly', () => {
      const env = stubGh(`
if [ "$1" = "issue" ] && [ "$2" = "view" ]; then
  echo '{"number":99,"title":"Direct Issue","body":"direct body","url":"https://github.com/example/example/issues/99"}'
  exit 0
fi
exit 1
`);

      const res = runScript(
        '.claude/skills/socratic-review/scripts/fetch-issue.sh',
        ['https://github.com/example/example/issues/99'],
        env
      );

      expect(res.stdout).toContain('Issue #99: Direct Issue');
      expect(res.stdout).toContain('direct body');
    });

    it('should strip a leading "#" when an issue number is passed', () => {
      const argsFile = path.join(tmpDir, 'gh-args.txt');
      const env = stubGh(`
echo "$@" >> "${argsFile}"
if [ "$1" = "issue" ] && [ "$2" = "view" ]; then
  echo '{"number":42,"title":"Numbered Issue","body":"body","url":"https://github.com/example/example/issues/42"}'
  exit 0
fi
exit 1
`);

      const res = runScript('.claude/skills/socratic-review/scripts/fetch-issue.sh', ['#42'], env);

      expect(res.stdout).toContain('Issue #42: Numbered Issue');
      const recordedArgs = fs.readFileSync(argsFile, 'utf-8');
      expect(recordedArgs).toContain('issue view 42');
    });
  });
});
