import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServerApp } from '../../src/server.js';
import { resolve } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';

test('Playwright dashboard verification: endpoints and files ready', async () => {
  const testWorkspace = resolve(process.cwd(), 'kilo-cline-workspace');
  if (!existsSync(testWorkspace)) mkdirSync(testWorkspace, { recursive: true });

  const { server, wss } = createServerApp({ port: 3000, workspaceDir: testWorkspace });
  await new Promise((res) => server.listen(3000, res));

  // Verify server endpoints are responsive
  const resConfig = await fetch('http://localhost:3000/api/config');
  assert.equal(resConfig.status, 200);
  const jsonConfig = await resConfig.json();
  assert.equal(jsonConfig.port, 3000);
  assert.ok(jsonConfig.availableFreeModels.cline.length > 0);
  assert.ok(jsonConfig.availableFreeModels.kilo.length > 0);

  const resFiles = await fetch('http://localhost:3000/api/workspace/files');
  assert.equal(resFiles.status, 200);
  const jsonFiles = await resFiles.json();
  assert.ok(Array.isArray(jsonFiles));

  const resHtml = await fetch('http://localhost:3000/index.html');
  assert.equal(resHtml.status, 200);
  const html = await resHtml.text();
  assert.ok(html.includes('Agent Collab Studio'));
  assert.ok(html.includes('xtermContainer'));

  await new Promise((resolve) => {
    wss.close(() => {
      server.close(resolve);
    });
  });
});
