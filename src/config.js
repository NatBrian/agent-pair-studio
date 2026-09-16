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
    kilo: process.env.KILO_MODEL || 'openrouter/meta-llama/llama-3.3-70b-instruct:free'
  },
  LOOP_LIMITS: {
    MAX_TURNS: parseInt(process.env.MAX_TURNS || '20', 10),
    TURN_TIMEOUT_SECONDS: parseInt(process.env.TURN_TIMEOUT_SECONDS || '180', 10),
    MAX_RETRIES: 3,
    RETRY_DELAYS_MS: [10000, 20000, 30000]
  }
};
