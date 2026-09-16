import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyError } from '../../src/utils/error-classifier.js';

test('classifyError identifies transient errors', () => {
  assert.equal(classifyError(1, 'Error: 429 Too Many Requests'), 'transient');
  assert.equal(classifyError(1, 'Rate limit exceeded. Please wait 10s.'), 'transient');
  assert.equal(classifyError(1, '503 Service Unavailable'), 'transient');
  assert.equal(classifyError(1, 'FetchError: ECONNRESET'), 'transient');
  assert.equal(classifyError(124, 'timeout'), 'transient');
});

test('classifyError identifies permanent errors', () => {
  assert.equal(classifyError(1, '401 Unauthorized: Invalid API key'), 'permanent');
  assert.equal(classifyError(1, 'Account quota exceeded or billing issue'), 'permanent');
  assert.equal(classifyError(1, '404 Model not found: invalid/model-name'), 'permanent');
});
