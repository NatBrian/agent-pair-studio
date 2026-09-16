import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
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

test('server handles terminal_input websocket message and executes command', async () => {
  const { server, wss } = createServerApp({ port: 0 });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  const ws = new WebSocket(`ws://localhost:${port}`);
  await new Promise((resolve) => ws.on('open', resolve));

  const received = [];
  ws.on('message', (msg) => {
    received.push(JSON.parse(msg.toString()));
  });

  ws.send(JSON.stringify({
    action: 'terminal_input',
    payload: { command: 'node -e "console.log(\'terminal-test-output\')"' }
  }));

  // Wait for command output
  await new Promise((resolve) => {
    const interval = setInterval(() => {
      const match = received.find((m) => m.type === 'terminal_output' && m.payload?.chunk?.includes('terminal-test-output'));
      if (match) {
        clearInterval(interval);
        resolve();
      }
    }, 50);
    setTimeout(() => {
      clearInterval(interval);
      resolve();
    }, 5000);
  });

  const found = received.some((m) => m.type === 'terminal_output' && m.payload?.chunk?.includes('terminal-test-output'));
  assert.ok(found, 'Should have received terminal_output with command output');

  ws.close();
  await new Promise((resolve) => {
    wss.close(() => {
      server.close(resolve);
    });
  });
});
