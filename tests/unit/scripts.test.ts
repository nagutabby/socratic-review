import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// macOS はデフォルトの /bin/bash が 3.2 系（mapfile 等の bash4+ 機能未対応）のため、
// 利用可能であれば Homebrew 版などの新しい bash を優先的に使う
function resolveBashBinary(): string {
  const candidates = ['/opt/homebrew/bin/bash', '/usr/local/bin/bash'];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return 'bash';
}

describe('Shell Scripts Unit Tests', () => {
  let tmpDir: string;
  // プロジェクトルート（.claude の親ディレクトリ）を動的に探す
  const projectRoot = path.resolve(__dirname, '../../');
  const bashBin = resolveBashBinary();

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
      const stdout = execSync(`"${bashBin}" "${scriptPath}" ${args.map((a) => `"${a}"`).join(' ')}`, {
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
  // 1. get-doc-paths-and-headings.sh のテスト
  // -------------------------------------------------------------
  describe('get-doc-paths-and-headings.sh', () => {
    it('should report "README: None", "ADR: None" and "SPEC: None" when no doc exists', () => {
      // 空のディレクトリ状態で実行
      const res = runScript('.claude/skills/socratic-review/scripts/get-doc-paths-and-headings.sh');
      expect(res.stdout).toContain('README: None');
      expect(res.stdout).toContain('ADR: None');
      expect(res.stdout).toContain('SPEC: None');
      expect(res.exitCode).toBe(0);
    });

    it('should detect README.md mock file and output its path with its full heading outline, not body content', () => {
      // README.md をモック作成
      const mockReadme = `# Project Title
概要テキスト

## Architecture
アーキテクチャの説明

### Components
コンポーネントの説明
`;
      fs.writeFileSync(path.join(tmpDir, 'README.md'), mockReadme);

      const res = runScript('.claude/skills/socratic-review/scripts/get-doc-paths-and-headings.sh');

      expect(res.stdout).toContain('=== README_PATHS ===');
      expect(res.stdout).toContain('Found 1 file(s)');
      expect(res.stdout).toContain('- README.md');
      expect(res.stdout).toContain('  - Project Title');
      expect(res.stdout).toContain('  - Architecture');
      expect(res.stdout).toContain('  - Components');
      // 本文はパスと見出しの取得のみで返さない
      expect(res.stdout).not.toContain('概要テキスト');
      expect(res.stdout).not.toContain('アーキテクチャの説明');
      expect(res.stdout).not.toContain('コンポーネントの説明');
    });

    it('should detect README.md recursively under a nested directory regardless of filename case', () => {
      fs.mkdirSync(path.join(tmpDir, 'docs/nested'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'docs/nested/README.MD'), '# Nested Readme\n\n## Overview\n本文\n');

      const res = runScript('.claude/skills/socratic-review/scripts/get-doc-paths-and-headings.sh');

      expect(res.stdout).toContain('=== README_PATHS ===');
      expect(res.stdout).toContain('Found 1 file(s)');
      expect(res.stdout).toContain('- docs/nested/README.MD');
      expect(res.stdout).toContain('  - Nested Readme');
      expect(res.stdout).toContain('  - Overview');
    });

    it('should detect ADR files under docs/adr and list them with their heading outline', () => {
      fs.mkdirSync(path.join(tmpDir, 'docs/adr'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'docs/adr/0001-use-postgres.md'),
        '# 0001 Use PostgreSQL\n\n## Context\n本文\n\n## Decision\n本文\n'
      );
      fs.writeFileSync(
        path.join(tmpDir, 'docs/adr/0002-use-grpc.md'),
        '# 0002 Use gRPC\n\n本文\n'
      );

      const res = runScript('.claude/skills/socratic-review/scripts/get-doc-paths-and-headings.sh');

      expect(res.stdout).toContain('=== ADR_PATHS ===');
      expect(res.stdout).toContain('Found 2 file(s)');
      expect(res.stdout).toContain('- docs/adr/0001-use-postgres.md');
      expect(res.stdout).toContain('  - 0001 Use PostgreSQL');
      expect(res.stdout).toContain('  - Context');
      expect(res.stdout).toContain('  - Decision');
      expect(res.stdout).toContain('- docs/adr/0002-use-grpc.md');
      expect(res.stdout).toContain('  - 0002 Use gRPC');
    });

    it('should detect ADR files under a case-insensitively/plural-matched directory (e.g. "ADRs")', () => {
      fs.mkdirSync(path.join(tmpDir, 'docs/ADRs'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'docs/ADRs/0001-decision.md'), '# Plural ADR Dir\n');

      const res = runScript('.claude/skills/socratic-review/scripts/get-doc-paths-and-headings.sh');

      expect(res.stdout).toContain('=== ADR_PATHS ===');
      expect(res.stdout).toContain('Found 1 file(s)');
      expect(res.stdout).toContain('- docs/ADRs/0001-decision.md');
      expect(res.stdout).toContain('  - Plural ADR Dir');
    });

    it('should detect standalone adr.md / adrs.md files at any case and depth', () => {
      fs.mkdirSync(path.join(tmpDir, 'some/deep/path'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'adr.md'), '# Root ADR File\n');
      fs.writeFileSync(path.join(tmpDir, 'some/deep/path/ADRS.md'), '# Nested Plural ADR File\n');

      const res = runScript('.claude/skills/socratic-review/scripts/get-doc-paths-and-headings.sh');

      expect(res.stdout).toContain('=== ADR_PATHS ===');
      expect(res.stdout).toContain('Found 2 file(s)');
      expect(res.stdout).toContain('- adr.md');
      expect(res.stdout).toContain('  - Root ADR File');
      expect(res.stdout).toContain('- some/deep/path/ADRS.md');
      expect(res.stdout).toContain('  - Nested Plural ADR File');
    });

    it('should detect Spec files under a spec/ directory and list them with their heading outline', () => {
      fs.mkdirSync(path.join(tmpDir, 'spec'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'spec/auth.md'), '# User Auth Spec\n\n## Endpoints\n本文\n');

      const res = runScript('.claude/skills/socratic-review/scripts/get-doc-paths-and-headings.sh');

      expect(res.stdout).toContain('=== SPEC_PATHS ===');
      expect(res.stdout).toContain('Found 1 file(s)');
      expect(res.stdout).toContain('- spec/auth.md');
      expect(res.stdout).toContain('  - User Auth Spec');
      expect(res.stdout).toContain('  - Endpoints');
    });

    it('should detect Spec files under a case-insensitively/plural-matched directory (e.g. "Specs")', () => {
      fs.mkdirSync(path.join(tmpDir, 'foo/Specs'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'foo/Specs/thing.md'), '# Plural Spec Dir\n');

      const res = runScript('.claude/skills/socratic-review/scripts/get-doc-paths-and-headings.sh');

      expect(res.stdout).toContain('=== SPEC_PATHS ===');
      expect(res.stdout).toContain('Found 1 file(s)');
      expect(res.stdout).toContain('- foo/Specs/thing.md');
      expect(res.stdout).toContain('  - Plural Spec Dir');
    });

    it('should detect standalone spec.md / specs.md files at any case and depth', () => {
      fs.mkdirSync(path.join(tmpDir, 'some/deep/path'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'spec.md'), '# Root Spec File\n');
      fs.writeFileSync(path.join(tmpDir, 'some/deep/path/SPECS.md'), '# Nested Plural Spec File\n');

      const res = runScript('.claude/skills/socratic-review/scripts/get-doc-paths-and-headings.sh');

      expect(res.stdout).toContain('=== SPEC_PATHS ===');
      expect(res.stdout).toContain('Found 2 file(s)');
      expect(res.stdout).toContain('- spec.md');
      expect(res.stdout).toContain('  - Root Spec File');
      expect(res.stdout).toContain('- some/deep/path/SPECS.md');
      expect(res.stdout).toContain('  - Nested Plural Spec File');
    });

    it('should exclude node_modules and .git directories from README/ADR/SPEC search', () => {
      fs.mkdirSync(path.join(tmpDir, 'node_modules/some-package/adr'), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, 'node_modules/some-package/adr/0001-decision.md'),
        '# Should Be Ignored\n'
      );
      fs.writeFileSync(path.join(tmpDir, 'node_modules/README.md'), '# Should Also Be Ignored\n');

      const res = runScript('.claude/skills/socratic-review/scripts/get-doc-paths-and-headings.sh');

      expect(res.stdout).toContain('README: None');
      expect(res.stdout).toContain('ADR: None');
      expect(res.stdout).toContain('SPEC: None');
    });

    it('should truncate the ADR listing beyond 20 files', () => {
      fs.mkdirSync(path.join(tmpDir, 'docs/adr'), { recursive: true });
      for (let i = 1; i <= 25; i++) {
        const n = String(i).padStart(4, '0');
        fs.writeFileSync(path.join(tmpDir, `docs/adr/${n}-decision.md`), `# ${n} Decision\n`);
      }

      const res = runScript('.claude/skills/socratic-review/scripts/get-doc-paths-and-headings.sh');

      expect(res.stdout).toContain('Found 25 file(s)');
      expect(res.stdout).toContain('... (and 5 more, truncated)');
    });

    it('should truncate the per-file heading outline beyond 15 headings', () => {
      const headings = Array.from({ length: 18 }, (_, i) => `## Heading ${i + 1}`).join('\n\n');
      fs.writeFileSync(path.join(tmpDir, 'README.md'), `# Title\n\n${headings}\n`);

      const res = runScript('.claude/skills/socratic-review/scripts/get-doc-paths-and-headings.sh');

      // 上限15件には先頭の "# Title" 自身も含まれるため、Heading 14 までが表示される
      expect(res.stdout).toContain('  - Heading 14');
      expect(res.stdout).not.toContain('  - Heading 15');
      expect(res.stdout).toContain('  - ... (more headings truncated)');
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

    const TAG_CASES = [
      // Security
      { tag: 'Security', dir: 'src/auth', file: 'login.ts', content: 'export const login = () => {}' },
      { tag: 'Security', dir: 'src/security', file: 'crypto.ts', content: 'export const encrypt = () => {}' },
      { tag: 'Security', dir: 'src/controllers', file: 'session.controller.ts', content: 'export class SessionController {}' },
      // QA
      { tag: 'QA', dir: 'tests/unit', file: 'example.test.ts', content: 'test("x", () => {});' },
      { tag: 'QA', dir: 'spec', file: 'user.spec.ts', content: 'describe("user", () => {});' },
      { tag: 'QA', dir: 'src/validators', file: 'input-validator.ts', content: 'export const validate = () => {}' },
      // Arch
      { tag: 'Arch', dir: 'src/core', file: 'container.ts', content: 'export class Container {}' },
      { tag: 'Arch', dir: 'src/interfaces', file: 'user-repository.ts', content: 'export interface UserRepository {}' },
      { tag: 'Arch', dir: 'src/db', file: 'schema.prisma', content: 'model User {}' },
      // Ops
      { tag: 'Ops', dir: 'config', file: 'docker-compose.yml', content: 'services: {}' },
      { tag: 'Ops', dir: '.github/workflows', file: 'ci.yml', content: 'name: CI' },
      { tag: 'Ops', dir: 'infra/terraform', file: 'main.tf', content: 'resource "aws_instance" "x" {}' },
      // UI/UX
      { tag: 'UI/UX', dir: 'src/components', file: 'Button.tsx', content: 'export const Button = () => null;' },
      { tag: 'UI/UX', dir: 'src/views', file: 'HomeView.vue', content: '<template></template>' },
      { tag: 'UI/UX', dir: 'src/styles', file: 'app.css', content: 'body { margin: 0; }' },
      // Logic/General (フォールバック)
      { tag: 'Logic/General', dir: 'src/utils', file: 'helpers.ts', content: 'export const add = (a,b) => a+b;' },
      { tag: 'Logic/General', dir: 'src/lib', file: 'math.ts', content: 'export const square = (n) => n*n;' },
      { tag: 'Logic/General', dir: 'src/models', file: 'order-summary.ts', content: 'export class OrderSummary {}' },
    ];

    it.each(TAG_CASES)('should tag files under $dir as $tag', ({ tag, dir, file, content }) => {
      fs.mkdirSync(path.join(tmpDir, dir), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, dir, file), content);
      execSync('git add . && git commit -m "add category file"', { cwd: tmpDir });

      const res = runScript('.claude/skills/socratic-review/scripts/fetch-diff.sh', ['HEAD~1']);

      expect(res.stdout).toContain('=== DIFF_SUMMARY ===');
      expect(res.stdout).toContain(`${dir}/${file}`);
      expect(res.stdout).toContain(`[Tags: ${tag}]`);
    });

    it('should return multiple category tags when the diff spans more than one category', () => {
      fs.mkdirSync(path.join(tmpDir, 'src/auth'), { recursive: true });
      fs.mkdirSync(path.join(tmpDir, 'src/components'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'src/auth/token.ts'), 'export const token = ""');
      fs.writeFileSync(path.join(tmpDir, 'src/components/View.tsx'), 'export const View = () => null;');
      execSync('git add . && git commit -m "add auth and component files"', { cwd: tmpDir });

      const res = runScript('.claude/skills/socratic-review/scripts/fetch-diff.sh', ['HEAD~1']);

      expect(res.stdout).toContain('src/auth/token.ts');
      expect(res.stdout).toContain('src/components/View.tsx');
      expect(res.stdout).toContain('[Tags: Security,UI/UX]');
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
      expect(lines[1]?.trim().startsWith('#')).toBe(true);
      expect(lines[1]).toContain('ログ出力は不要と判断しているため意図的です');
      expect(lines[1]).not.toContain('[socratic-review]');
    });

    it('should refuse to write to a file outside the working directory (path containment)', () => {
      const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socratic-script-test-outside-'));
      const outsideFile = path.join(outsideDir, 'secret.txt');
      fs.writeFileSync(outsideFile, 'line1\nline2\n');

      try {
        const res = runScript('.claude/skills/socratic-review/scripts/append-comment.sh', [
          outsideFile,
          '1',
          '作業ディレクトリ外への書き込み試行',
        ]);

        expect(res.exitCode).toBe(1);
        expect(res.stdout).toContain('ERROR');
        expect(fs.readFileSync(outsideFile, 'utf-8')).toBe('line1\nline2\n');
      } finally {
        fs.rmSync(outsideDir, { recursive: true, force: true });
      }
    });

    it('should refuse to write to a file reached via a ".." path traversal out of the working directory', () => {
      const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socratic-script-test-outside-'));
      const outsideFile = path.join(outsideDir, 'secret.txt');
      fs.writeFileSync(outsideFile, 'line1\n');

      const relativeTraversalPath = path.join(path.relative(tmpDir, outsideDir), 'secret.txt');

      try {
        const res = runScript('.claude/skills/socratic-review/scripts/append-comment.sh', [
          relativeTraversalPath,
          '1',
          '作業ディレクトリ外への書き込み試行',
        ]);

        expect(res.exitCode).toBe(1);
        expect(res.stdout).toContain('ERROR');
        expect(fs.readFileSync(outsideFile, 'utf-8')).toBe('line1\n');
      } finally {
        fs.rmSync(outsideDir, { recursive: true, force: true });
      }
    });
  });

  // -------------------------------------------------------------
  // 4. fetch-pull-request.sh のテスト（gh コマンドをスタブして検証）
  // -------------------------------------------------------------
  describe('fetch-pull-request.sh', () => {
    it('should exit with an error when no PR reference is given', () => {
      const res = runScript('.claude/skills/socratic-review/scripts/fetch-pull-request.sh', []);

      expect(res.exitCode).not.toBe(0);
    });

    it('should report PR: NOT_FOUND when the given PR cannot be fetched', () => {
      const env = stubGh('exit 1');

      const res = runScript(
        '.claude/skills/socratic-review/scripts/fetch-pull-request.sh',
        ['https://github.com/example/example/pull/7'],
        env
      );

      expect(res.stdout).toContain('PR: NOT_FOUND');
    });

    it('should fetch the PR directly when a PR URL is passed explicitly, printing number, title, url and changed files', () => {
      const env = stubGh(`
if [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  echo '{"number":7,"title":"Fix bug","body":"Closes #42","url":"https://github.com/example/example/pull/7","files":[{"path":"src/a.ts"},{"path":"src/b.ts"}]}'
  exit 0
fi
exit 1
`);

      const res = runScript(
        '.claude/skills/socratic-review/scripts/fetch-pull-request.sh',
        ['https://github.com/example/example/pull/7'],
        env
      );

      expect(res.stdout).toContain('PR #7: Fix bug');
      expect(res.stdout).toContain('URL: https://github.com/example/example/pull/7');
      expect(res.stdout).toContain('- src/a.ts');
      expect(res.stdout).toContain('- src/b.ts');
    });

    it('should strip a leading "#" when a PR number is passed', () => {
      const argsFile = path.join(tmpDir, 'gh-args.txt');
      const env = stubGh(`
echo "$@" >> "${argsFile}"
if [ "$1" = "pr" ] && [ "$2" = "view" ]; then
  echo '{"number":7,"title":"Fix bug","body":"body","url":"https://github.com/example/example/pull/7","files":[]}'
  exit 0
fi
exit 1
`);

      const res = runScript('.claude/skills/socratic-review/scripts/fetch-pull-request.sh', ['#7'], env);

      expect(res.stdout).toContain('PR #7: Fix bug');
      const recordedArgs = fs.readFileSync(argsFile, 'utf-8');
      expect(recordedArgs).toContain('pr view 7');
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

  // -------------------------------------------------------------
  // 6. commit.sh のテスト
  // -------------------------------------------------------------
  describe('commit.sh', () => {
    beforeEach(() => {
      // tmpDir を Git リポジトリとして初期化してダミーコミット（デフォルトブランチは main）
      execSync(
        'git init -b main && git config user.name "Test" && git config user.email "test@example.com"',
        { cwd: tmpDir }
      );
      fs.writeFileSync(path.join(tmpDir, 'dummy.txt'), 'initial');
      execSync('git add . && git commit -m "initial"', { cwd: tmpDir });
    });

    it('should fail with exit code 1 when no commit message is given', () => {
      const res = runScript('.claude/skills/socratic-review/scripts/commit.sh');
      expect(res.exitCode).toBe(1);
    });

    it.each(['main', 'master', 'develop'])(
      'should refuse to commit on the protected branch "%s"',
      (branch) => {
        if (branch !== 'main') {
          execSync(`git checkout -b ${branch}`, { cwd: tmpDir });
        }
        fs.writeFileSync(path.join(tmpDir, 'change.txt'), 'changed');

        const res = runScript('.claude/skills/socratic-review/scripts/commit.sh', ['some change']);

        expect(res.exitCode).toBe(1);
        expect(res.stdout).toContain('ERROR');
        expect(res.stdout).toContain(branch);
      }
    );

    it('should commit all working tree changes on a non-protected branch', () => {
      execSync('git checkout -b feature/foo', { cwd: tmpDir });
      fs.writeFileSync(path.join(tmpDir, 'change.txt'), 'changed');

      const res = runScript('.claude/skills/socratic-review/scripts/commit.sh', ['add change.txt']);

      expect(res.exitCode).toBe(0);
      expect(res.stdout).toBe('COMMITTED: feature/foo - add change.txt');

      const status = execSync('git status --porcelain', { cwd: tmpDir, encoding: 'utf-8' });
      expect(status.trim()).toBe('');
      const log = execSync('git log --oneline -1', { cwd: tmpDir, encoding: 'utf-8' });
      expect(log).toContain('add change.txt');
    });

    it('should report NO_CHANGES and exit 0 when there is nothing to commit', () => {
      execSync('git checkout -b feature/foo', { cwd: tmpDir });

      const res = runScript('.claude/skills/socratic-review/scripts/commit.sh', ['nothing to see']);

      expect(res.exitCode).toBe(0);
      expect(res.stdout).toBe('NO_CHANGES: commit対象の変更がありません');
    });

    it.each(['.env', '.env.local', 'id_rsa', 'credentials.json', 'secrets.yaml', 'server.pem'])(
      'should refuse to commit when a suspicious secret-like file "%s" is present, and stage nothing',
      (secretFileName) => {
        execSync('git checkout -b feature/foo', { cwd: tmpDir });
        fs.writeFileSync(path.join(tmpDir, 'change.txt'), 'changed');
        fs.writeFileSync(path.join(tmpDir, secretFileName), 'super-secret-value');

        const res = runScript('.claude/skills/socratic-review/scripts/commit.sh', ['add change.txt']);

        expect(res.exitCode).toBe(1);
        expect(res.stdout).toContain('ERROR');
        expect(res.stdout).toContain(secretFileName);

        const status = execSync('git status --porcelain', { cwd: tmpDir, encoding: 'utf-8' });
        // 何もステージされておらず、commitも行われていないこと
        expect(status).not.toContain('A ');
        const log = execSync('git log --oneline -1', { cwd: tmpDir, encoding: 'utf-8' });
        expect(log).not.toContain('add change.txt');
      }
    );

    it('should commit normally when no suspicious secret-like files are present', () => {
      execSync('git checkout -b feature/foo', { cwd: tmpDir });
      fs.writeFileSync(path.join(tmpDir, 'change.txt'), 'changed');
      fs.writeFileSync(path.join(tmpDir, 'environment.ts'), 'export const env = "production";');

      const res = runScript('.claude/skills/socratic-review/scripts/commit.sh', ['add change.txt']);

      expect(res.exitCode).toBe(0);
      expect(res.stdout).toBe('COMMITTED: feature/foo - add change.txt');
    });
  });

  // -------------------------------------------------------------
  // 7. push.sh のテスト
  // -------------------------------------------------------------
  describe('push.sh', () => {
    let bareDir: string;

    beforeEach(() => {
      // origin として使うベアリポジトリを別ディレクトリに作成する
      bareDir = fs.mkdtempSync(path.join(os.tmpdir(), 'socratic-script-test-bare-'));
      execSync(`git init -q --bare "${bareDir}"`, { cwd: tmpDir });

      execSync(
        'git init -b main && git config user.name "Test" && git config user.email "test@example.com"',
        { cwd: tmpDir }
      );
      execSync(`git remote add origin "${bareDir}"`, { cwd: tmpDir });
      fs.writeFileSync(path.join(tmpDir, 'dummy.txt'), 'initial');
      execSync('git add . && git commit -m "initial"', { cwd: tmpDir });
    });

    afterEach(() => {
      fs.rmSync(bareDir, { recursive: true, force: true });
    });

    it.each(['main', 'master', 'develop'])(
      'should refuse to push the protected branch "%s"',
      (branch) => {
        if (branch !== 'main') {
          execSync(`git checkout -b ${branch}`, { cwd: tmpDir });
        }

        const res = runScript('.claude/skills/socratic-review/scripts/push.sh');

        expect(res.exitCode).toBe(1);
        expect(res.stdout).toContain('ERROR');
        expect(res.stdout).toContain(branch);

        const remoteRefs = execSync(`git ls-remote "${bareDir}"`, { encoding: 'utf-8' });
        expect(remoteRefs.trim()).toBe('');
      }
    );

    it('should push the current working branch to origin when no target is given', () => {
      execSync('git checkout -b feature/foo', { cwd: tmpDir });

      const res = runScript('.claude/skills/socratic-review/scripts/push.sh');

      expect(res.exitCode).toBe(0);
      expect(res.stdout).toBe('PUSHED: origin/feature/foo');

      const remoteRefs = execSync(`git ls-remote "${bareDir}"`, { encoding: 'utf-8' });
      expect(remoteRefs).toContain('refs/heads/feature/foo');
    });

    it('should refuse to push when the given target branch differs from the current working branch', () => {
      execSync('git checkout -b feature/foo', { cwd: tmpDir });

      const res = runScript('.claude/skills/socratic-review/scripts/push.sh', ['other-branch']);

      expect(res.exitCode).toBe(1);
      expect(res.stdout).toContain('ERROR');
      expect(res.stdout).toContain('feature/foo');
      expect(res.stdout).toContain('other-branch');

      const remoteRefs = execSync(`git ls-remote "${bareDir}"`, { encoding: 'utf-8' });
      expect(remoteRefs.trim()).toBe('');
    });
  });
});
