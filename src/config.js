import { resolve } from 'node:path';

const rootDir = process.cwd();

export const config = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  WORKSPACE_DIR: resolve(process.env.WORKSPACE_DIR || resolve(rootDir, 'kilo-cline-workspace')),
  DATA_DIR: resolve(process.env.DATA_DIR || resolve(rootDir, 'data')),
  KILO_CMD: process.env.KILO_CMD || 'kilo',
  CLINE_CMD: process.env.CLINE_CMD || 'cline',
  DEFAULT_MODELS: {
    cline: process.env.CLINE_MODEL || 'cline-free/deepseek-v4.1-flash',
    kilo: process.env.KILO_MODEL || 'kilo/kilo-auto/free'
  },
  AVAILABLE_FREE_MODELS: {
    kilo: [
      'kilo/kilo-auto/free',
      'kilo/meta/muse-spark-1.2',
      'kilo/meta/muse-spark-1.3',
      'kilo/deepseek/deepseek-chat:free',
      'kilo/meta-llama/llama-3.3-70b-instruct:free',
      'kilo/google/gemini-2.5-flash:free',
      'kilo/qwen/qwen-2.5-coder-32b-instruct:free',
      'kilo/z-ai/glm-5.2:free',
      'kilo/stepfun/step-3.7-flash:free',
      'kilo/openrouter/free'
    ],
    cline: [
      'cline-free/deepseek-v4.1-flash',
      'deepseek/deepseek-chat',
      'meta/muse-spark-1.2',
      'meta/muse-spark-1.3',
      'openrouter/free'
    ]
  },
  LOOP_LIMITS: {
    MAX_TURNS: parseInt(process.env.MAX_TURNS || '20', 10),
    TURN_TIMEOUT_SECONDS: parseInt(process.env.TURN_TIMEOUT_SECONDS || '180', 10),
    MAX_RETRIES: 3,
    RETRY_DELAYS_MS: [10000, 20000, 30000]
  }
};
