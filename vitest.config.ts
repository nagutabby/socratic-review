import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30000, // LLM評価呼び出しのためタイムアウトを長めに設定
  },
});
