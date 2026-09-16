import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServerApp } from '../../src/server.js';

test('server app exports routes and starts cleanly', async () => {
  const { app, server, wss } = createServerApp({ port: 0 });
  assert.ok(app);
  assert.ok(server);
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  assert.ok(address.port > 0);
  await new Promise((resolve) => {
    wss.close(() => {
      server.close(resolve);
    });
  });
});
