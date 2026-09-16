import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { config } from '../../src/config.js';

test('config exports required properties with sensible defaults', () => {
  assert.equal(typeof config.PORT, 'number');
  assert.equal(config.PORT, 3000);
  assert.equal(typeof config.WORKSPACE_DIR, 'string');
  assert.equal(config.WORKSPACE_DIR, resolve(process.cwd(), 'kilo-cline-workspace'));
  assert.equal(typeof config.DATA_DIR, 'string');
  assert.equal(config.DATA_DIR, resolve(process.cwd(), 'data'));
  assert.equal(typeof config.DEFAULT_MODELS.kilo, 'string');
  assert.equal(typeof config.DEFAULT_MODELS.cline, 'string');
  assert.equal(config.DEFAULT_MODELS.cline, 'cline-free/deepseek-v4.1-flash');
  assert.equal(config.LOOP_LIMITS.MAX_TURNS, 20);
  assert.equal(config.LOOP_LIMITS.TURN_TIMEOUT_SECONDS, 180);
});
